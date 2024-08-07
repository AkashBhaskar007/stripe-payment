/* eslint-disable */
import { ProjectMilestone } from "@core/project/models/project-milestones.entity";
import { Project } from "@core/project/models/project.entity";
import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import {
  Between,
  FindOptionsWhere,
  In,
  IsNull,
  LessThanOrEqual,
  MoreThan,
  MoreThanOrEqual,
  Not,
  Repository,
} from "typeorm";
import { ProjectBilling } from "./models/project-billing.entity";
import {
  MilestonePaymentStatus,
  ProjectExpertStatus,
  ProjectMilestoneStatus,
  ProjectStatus,
} from "enums/project.enum";
import { Users } from "@app/authentication/models/users.entity";
import { ProjectService } from "@core/project";
import { WebhookType } from "enums/webhook.enum";
import { UserCardDetails } from "./models/user-card-details.entity";
import { UserType } from "enums/user-type.enum";
import { StripeService } from "./stripe.service";
import { UserStatus } from "enums/user-staus.enum";
import { NotificationsService } from "@app/notifications";
import { generalConfig, paymentConfig } from "config";
import { EmailType } from "enums/email-type.enum";
import { EmailsService } from "@app/emails";
import { UserConnects } from "./models/user-connects.entity";
import { BankAccounts } from "./models/external_accounts.entity";
import { UserTransactions } from "./models/user-transactions.entity";
import { CardPaymentStatus, PaymentStatus } from "enums/payment.enum";
import { UserPayouts } from "./models/user-payouts.entity";
import { BankStatus } from "enums/bank-status.enum";
import { TransactionType } from "enums/transaction-type.enum";
import { PlatformPayout } from "./models/platform-payout.entity";
import { CreatePaymentDto } from "./payments.dto";
import { ProjectExpert } from "@core/project/models/project-experts.entity";
const moment = require("moment");

@Injectable()
export class PaymentsService {
  constructor(
    @InjectRepository(ProjectMilestone)
    private readonly projectMilestoneRepository: Repository<ProjectMilestone>,
    @InjectRepository(Project)
    private readonly projectRepository: Repository<Project>,
    @InjectRepository(ProjectBilling)
    private readonly projectBillingRepository: Repository<ProjectBilling>,
    @InjectRepository(ProjectExpert)
    private projectExpertRepository: Repository<ProjectExpert>,
    @InjectRepository(UserCardDetails)
    private readonly userCardRepository: Repository<UserCardDetails>,
    @InjectRepository(UserConnects)
    private readonly UserConnectsRepository: Repository<UserConnects>,
    @InjectRepository(BankAccounts)
    private readonly BankAccountRepository: Repository<BankAccounts>,
    @InjectRepository(Users)
    private UserRepository: Repository<Users>,
    @InjectRepository(UserTransactions)
    private userTransactions: Repository<UserTransactions>,
    @InjectRepository(UserPayouts)
    private userPayoutRepository: Repository<UserPayouts>,
    @InjectRepository(PlatformPayout)
    private platformPayoutRepository: Repository<PlatformPayout>,

    private readonly projectService: ProjectService,
    private readonly stripeService: StripeService,
    private notificationService: NotificationsService,
    private readonly emailsService: EmailsService
  ) {}

  public async createPayout() {
    try {
      const adminId = await this.UserRepository.findOne({
        where: {
          user_type: UserType.Administrator,
        },
      });
      const payout = await this.projectBillingRepository
        .createQueryBuilder("project_billing")
        .select("expert_id")
        .addSelect("SUM(payout_pending)", "total_payout_pending")
        .addSelect(
          `json_agg(json_build_object('project_id', project_id,'client_id', client_id, 'payout_pending', payout_pending))`,
          "projectDetails"
        )
        .where("payout_pending > 0")
        .andWhere("is_payout_pending = :is_payout_pending", {
          is_payout_pending: false,
        })
        .groupBy("expert_id")
        .having("SUM(payout_pending) > 0")
        .getRawMany();

      if (payout.length === 0) {
        return true;
      }

      for (let i = 0; i < payout.length; i++) {
        const connect = await this.UserRepository.findOne({
          where: {
            id: payout[i].expert_id,
          },
          select: {
            id: true,
            connect_id: true,
            is_connect_verified: true,
          },
        });

        if (connect.connect_id != null && connect.is_connect_verified) {
          const bank_account = await this.BankAccountRepository.findOne({
            where: {
              connect_id: connect.connect_id,
              is_primary: true,
            },
          });

          if (!bank_account) {
            await this.notificationService.NoBankAdded(
              connect.id,
              payout[i].payout_pending,
              adminId.id
            );
          } else {
            const createPayout = await this.stripeService.createPayout(
              payout[i].total_payout_pending,
              bank_account.stripe_bank_id,
              connect.connect_id,
              payout[i].expert_id
            );
            if (createPayout) {
              for (let j = 0; j < payout[i].projectDetails.length; j++) {
                await this.projectBillingRepository.update(
                  {
                    payout_pending: payout[i].projectDetails[j].payout_pending,
                    expert: { id: payout[i].expert_id },
                    client: { id: payout[i].projectDetails[j].client_id },
                    project: { id: payout[i].projectDetails[j].project_id },
                    is_payout_pending: false,
                  },
                  { payout_id: createPayout.id, is_payout_pending: true }
                );
              }
            }
          }
        } else {
          await this.notificationService.NoBankAdded(
            connect.id,
            payout[i].total_payout_pending,
            adminId.id
          );
        }
      }

      return payout;
    } catch (e) {
      console.error(e, "error");
      throw new BadRequestException(`Unable to create payout - ${e.message}`);
    }
  }

  async createPaymentIntent(paymentDetails: CreatePaymentDto, user) {
    const { project_id, expert_id, card_id } = paymentDetails;
    try {
      const client = await this.UserRepository.findOne({
        where: {
          id: user.id,
        },
      });

      if (!client) throw new NotFoundException(`User not found`);

      const proposal_amount =
        await this.projectService.getProjectProposalAmount(
          project_id,
          expert_id,
          user.id
        );

      let processing_percentage = 0;
      let international_charge = 0;

      const cardInfo = await this.stripeService.cardInfo(card_id);

      if (cardInfo.card.country == paymentConfig.country.US)
        international_charge = 0;
      else international_charge = paymentConfig.defaultInternationalCharge;

      if (paymentConfig.isPlaformFeeRequired) {
        processing_percentage = paymentConfig.platformFeePercentage;
      }

      const platform_fees = (proposal_amount * processing_percentage) / 100;
      const rounded_platform_fees = parseFloat(platform_fees.toFixed(2));
      const project_total = this.stripeService.calcTotalStripeAmount(
        proposal_amount,
        rounded_platform_fees,
        international_charge
      );

      const processing_fees = this.stripeService.calcStripeProcessingFee(
        project_total,
        international_charge
      );

      const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(project_total * 100),
        currency: paymentConfig.currency.USD,
        payment_method: card_id,
        customer: `${client.stripe_customer_id}`,
        return_url: paymentDetails.return_url,
        metadata: {
          project_id,
          expert_id,
          client_id: user.id,
          webhook_env: paymentConfig.webhookUrl,
          consultant_proposal_amount: proposal_amount,
          platform_fees: rounded_platform_fees,
          processing_fees: processing_fees,
        },
        confirm: true,
      });

      if (paymentIntent.status == CardPaymentStatus.REQUIRES_ACTION) {
        const paymentUrl = paymentIntent.next_action.redirect_to_url.url;

        return {
          message: "Redirecting to complete payment",
          statusCode: 200,
          data: { url: paymentUrl },
        };
      } else if (paymentIntent.status == CardPaymentStatus.SUCCEEDED) {
        return {
          message: "Payment successfull",
          statusCode: 200,
          data: paymentIntent,
        };
      }
    } catch (e) {
      console.error(e, "error");
      throw new BadRequestException(
        `Unable to complete payment - ${e.message}`
      );
    }
  }

  public async billingSummary(expertId: string, projectId: string, user, card) {
    try {
      const project = await this.projectRepository.findOne({
        select: {
          id: true,
          status: true,
          is_edited: true,
          is_declined: true,
        },
        where: {
          id: projectId,
        },
      });

      if (!project)
        throw new NotFoundException(`Project with given details not found`);

      const milestoneDetails = await this.projectRepository.findOne({
        where: {
          created_by: user.id,
          id: projectId,
          project_milestone: {
            project: { id: projectId },
            user: { id: expertId },
          },
          user: {
            id: user.id,
            user_type: UserType.Client,
          },
        },
        relations: {
          project_milestone: true,
          user: true,
        },
      });
      if (!milestoneDetails)
        throw new NotFoundException(
          `Project with given details not found or user not a client`
        );

      if (
        project.status !== ProjectStatus.AWARDED &&
        project.status !== ProjectStatus.COMPLETED
      ) {
        let sum = await this.projectMilestoneRepository
          .createQueryBuilder("total")
          .where("project_id = :p_id", { p_id: projectId })
          .andWhere("user_id = :u_id", { u_id: expertId })
          .select("SUM(amount)", "total_amount")
          .getRawOne();
        const milestoneAmount = await this.projectMilestoneRepository.findOne({
          where: {
            project: { id: projectId },
            user: { id: expertId },
          },
        });
        let processing_percentage;
        let international_charge;

        if (card) {
          const cardCountry = await this.stripeService.cardInfo(card);

          if (cardCountry.card.country == "US") {
            international_charge = 0;
          } else international_charge = 0.015;
        } else international_charge = 0;

        if (paymentConfig.isPlaformFeeRequired) {
          processing_percentage = paymentConfig.platformFeePercentage;
        } else processing_percentage = 0;

        const platform_fees = (sum.total_amount * processing_percentage) / 100;
        const rounded_platform_fees = platform_fees.toFixed(2);
        const total =
          (parseFloat(sum.total_amount) +
            parseFloat(rounded_platform_fees) +
            0.3) /
          (1 - (0.029 + international_charge));
        const project_total = total.toFixed(2);

        const processing_fees =
          parseFloat(project_total) * (0.029 + international_charge) + 0.3;

        const rounded_processing_fees = processing_fees.toFixed(2);
        const firstName = milestoneDetails.user.first_name || "";
        const lastName = milestoneDetails.user.last_name || "";

        return {
          isPlaformFeeRequired: paymentConfig.isPlaformFeeRequired,
          platformFeePercentage: paymentConfig.platformFeePercentage,
          consultant_proposal: parseFloat(sum.total_amount),
          platform_fees: paymentConfig.isPlaformFeeRequired
            ? parseFloat(rounded_platform_fees)
            : +(
                (sum.total_amount * paymentConfig.platformFeePercentage) /
                100
              ).toFixed(2),
          processing_fees: parseFloat(rounded_processing_fees),
          project_total: parseFloat(project_total),
          userName: `${firstName} ${lastName}`,
          email: milestoneDetails.user.email,
          phoneNumber: milestoneDetails.user.phone_number,
        };
      } else if (
        project.status === ProjectStatus.AWARDED &&
        project.is_edited &&
        !project.is_declined
      ) {
        const balanceAmount = await this.getUpdatedMilestoneAmount(
          projectId,
          expertId
        );

        let processing_percentage = 0;
        let international_charge = 0;

        if (card) {
          const cardCountry = await this.stripeService.cardInfo(card);

          if (cardCountry.card.country == "US") {
            international_charge = 0;
          } else international_charge = 0.015;
        } else international_charge = 0;

        if (paymentConfig.isPlaformFeeRequired) {
          processing_percentage = paymentConfig.platformFeePercentage;
        } else processing_percentage = 0;

        const platform_fees = (balanceAmount * processing_percentage) / 100;
        const rounded_platform_fees = platform_fees.toFixed(2);
        const total =
          (balanceAmount + parseFloat(rounded_platform_fees) + 0.3) /
          (1 - (0.029 + international_charge));
        const project_total = total.toFixed(2);

        const processing_fees =
          parseFloat(project_total) * (0.029 + international_charge) + 0.3;

        const rounded_processing_fees = processing_fees.toFixed(2);

        return {
          isPlaformFeeRequired: paymentConfig.isPlaformFeeRequired,
          platformFeePercentage: paymentConfig.platformFeePercentage,
          consultant_proposal: balanceAmount,
          platform_fees: paymentConfig.isPlaformFeeRequired
            ? parseFloat(rounded_platform_fees)
            : +(
                (balanceAmount * paymentConfig.platformFeePercentage) /
                100
              ).toFixed(2),
          processing_fees: parseFloat(rounded_processing_fees),
          project_total: parseFloat(project_total),
          userName: milestoneDetails.user.user_name,
          email: milestoneDetails.user.email,
          phoneNumber: milestoneDetails.user.phone_number,
        };
      }
    } catch (e) {
      console.error(e, "error");
      throw new BadRequestException(
        `Unable to create checkout session - ${e.message}`
      );
    }
  }

  private async getUpdatedMilestoneAmount(projectId: string, expertId: string) {
    const projectMilestones = await this.projectMilestoneRepository.find({
      select: {
        id: true,
        status: true,
        amount: true,
        temp_amount: true,
        temp_delete: true,
        is_temp: true,
      },
      where: {
        project: {
          id: projectId,
        },
        user: {
          id: expertId,
        },
      },
    });

    let originalAmount = 0;
    let newAmount = 0;

    projectMilestones.forEach((item) => {
      if (!item.is_temp) {
        originalAmount += +item.amount;
      }

      newAmount += item.temp_amount ? +item.temp_amount : +item.amount;
    });

    const balanceAmount = +(newAmount - originalAmount).toFixed(2);
    return balanceAmount;
  }

  async platformPayout(body: any) {
    try {
      let amount = body.data.object.amount;
      let transaction_id = body.data.object.id;
      let status = body.data.object.status;

      const payout = await this.platformPayoutRepository.create({
        transferred_amount: amount / 100,
        transaction_id: transaction_id,
        payout_status: status,
      });
      await this.platformPayoutRepository.save(payout);

      return body;
    } catch (err) {
      throw new Error(`Webhook Error: ${err.message}`);
    }
  }

  async handleStripeWebhook(body: any) {
    try {
      let connectId = body.data.object.id;
      let requirements = body.data.object.requirements;
      let individual = body.data.object.individual;
      let bankAccount = body.data.object.external_accounts;
      const userId = body.data.object.metadata.user_id;
      const country = body.data.object.metadata.country;

      if (
        requirements.disabled_reason == null &&
        individual.verification.status == "verified"
      ) {
        const updateStripe = await this.UserRepository.update(
          { id: userId },
          { is_connect_verified: true }
        );
        await this.UserConnectsRepository.update(
          { connect_id: connectId },
          { verification_status: "Verified", reason: "" }
        );
        if (updateStripe) {
          await this.notificationService.Verified(userId);
        }
        const existingBank = await this.BankAccountRepository.findOne({
          where: {
            stripe_bank_id: bankAccount.data[0].id,
          },
        });
        if (!existingBank) {
          const bankDetails = await this.BankAccountRepository.create({
            connect_id: connectId,
            stripe_bank_id: bankAccount.data[0].id,
            bank_status: bankAccount.data[0].status,
            account_number_last4: bankAccount.data[0].last4,
            routing_number: bankAccount.data[0].routing_number,
            is_primary: bankAccount.data[0].default_for_currency,
            reason: "",
            country: country,
          });
          await this.BankAccountRepository.save(bankDetails);
        }
      } else if (individual.verification.status == "unverified") {
        await this.UserRepository.update(
          { id: userId },
          { is_connect_verified: false }
        );
        await this.UserConnectsRepository.update(
          { connect_id: body.data.object.id },
          {
            verification_status: "Pending",
            reason: "Details yet to be provided",
          }
        );
      }
      return body;
    } catch (err) {
      throw new Error(`Webhook Error: ${err.message}`);
    }
  }
  async handlePayoutCreatedWebhook(body: any) {
    try {
      const amount = body.data.object.metadata.amount;
      const expert_id = body.data.object.metadata.expert_id;
      const status = body.data.object.status;
      if (status === "pending" || status === "in_transit") {
        await this.notificationService.PayoutProcessed(amount, expert_id);
      }
    } catch (err) {
      console.error(err);
      throw new Error(`Webhook Error: ${err.message}`);
    }
  }
  async handlePayoutCompleteWebhook(body: any) {
    try {
      const amount = body.data.object.metadata.amount;
      const expert_id = body.data.object.metadata.expert_id;
      const transfer_id = body.data.object.metadata.transfer_id;
      const bank_id = body.data.object.destination;
      const status = body.data.object.status;
      const payout_id = body.data.object.id;
      const failure_message = body.data.object.failure_message;
      const failure_code = body.data.object.failure_code;
      const connect_id = body.account;

      const admin = await this.UserRepository.findOne({
        where: {
          user_type: UserType.Administrator,
        },
      });

      let updateBilling = await this.projectBillingRepository.find({
        where: {
          payout_id: payout_id,
          expert: { id: expert_id },
        },
        select: {
          payout_id: true,
          payout_pending: true,
          payout_completed: true,
          is_payout_pending: true,
          client: {
            id: true,
          },
          project: {
            id: true,
          },
        },
        relations: {
          client: true,
          project: true,
        },
      });

      if (status === "paid") {
        for (let i = 0; i < updateBilling.length; i++) {
          await this.projectBillingRepository.update(
            {
              payout_id: payout_id,
              payout_pending: updateBilling[i].payout_pending,
              client: { id: updateBilling[i].client.id },
              project: { id: updateBilling[i].project.id },
              expert: { id: expert_id },
              is_payout_pending: true,
            },
            {
              payout_pending: 0,
              payout_completed:
                Number(updateBilling[i].payout_completed) +
                Number(updateBilling[i].payout_pending),
              is_payout_pending: false,
              payout_id: null,
            }
          );
          const addPayout = this.userPayoutRepository.create({
            payout_amount: updateBilling[i].payout_pending,
            project: { id: updateBilling[i].project.id },
            user: { id: updateBilling[i].client.id },
            created_by: expert_id,
            payout_status: status,
          });
          await this.userPayoutRepository.save(addPayout);
        }
        const addTransaction = this.userTransactions.create({
          user_id: { id: expert_id },
          created_by: expert_id,
          transaction_type: TransactionType.Payout,
          amount: amount,
          status: PaymentStatus.COMPLETE,
          transaction_id: payout_id,
        });
        await this.userTransactions.save(addTransaction);
        await this.notificationService.PayoutCompleted(
          amount,
          expert_id,
          admin.id
        );
      } else if (status === "failed") {
        const transferReversal = await this.stripeService.reverseTransfer(
          transfer_id
        );
        if (transferReversal) {
          updateBilling = await this.projectBillingRepository.find({
            where: {
              payout_id: payout_id,
              expert: { id: expert_id },
            },
            select: {
              payout_id: true,
              payout_pending: true,
              payout_completed: true,
              is_payout_pending: true,
              client: {
                id: true,
              },
              project: {
                id: true,
              },
            },
            relations: {
              client: true,
              project: true,
            },
          });
          for (let j = 0; j < updateBilling.length; j++) {
            await this.projectBillingRepository.update(
              {
                payout_pending: updateBilling[j].payout_pending,
                expert: { id: expert_id },
                client: { id: updateBilling[j].client.id },
                project: { id: updateBilling[j].project.id },
                is_payout_pending: true,
              },
              { payout_id: null, is_payout_pending: false }
            );
            const addPayout = this.userPayoutRepository.create({
              payout_amount: updateBilling[j].payout_pending,
              project: { id: updateBilling[j].project.id },
              user: { id: updateBilling[j].client.id },
              created_by: expert_id,
              payout_status: status,
              reason: failure_message,
            });
            await this.userPayoutRepository.save(addPayout);
          }
          const addTransaction = this.userTransactions.create({
            user_id: { id: expert_id },
            created_by: expert_id,
            transaction_type: TransactionType.Payout,
            amount: amount,
            status: PaymentStatus.FAILED,
            transaction_id: payout_id,
          });
          await this.userTransactions.save(addTransaction);
          await this.BankAccountRepository.update(
            { stripe_bank_id: bank_id, connect_id: connect_id },
            {
              reason: failure_message,
              bank_status: failure_code,
              status: BankStatus.ERROR,
            }
          );

          await this.notificationService.PayoutFailed(
            amount,
            expert_id,
            admin.id
          );
        } else {
          throw new Error("Erro while transferring");
        }
      }
    } catch (err) {
      console.error(err);
      throw new Error(`Webhook Error: ${err.message}`);
    }
  }

  async handlePaymentWebhook(body: any) {
    try {
      const project_id = body.data.object.metadata.project_id;
      const expert_id = body.data.object.metadata.expert_id;
      const clientId = body.data.object.metadata.client_id;
      const processing_fees = body.data.object.metadata.processing_fees;
      const platform_fees = body.data.object.metadata.platform_fees;
      const transaction_id = body.data.object.id;
      const payment_method = body.data.object.payment_method;
      const currency = body.data.object.currency;
      const consultant_amount =
        body.data.object.metadata.consultant_proposal_amount;
      const status = ProjectExpertStatus.AWARDED;
      switch (body.type) {
        case WebhookType.PAYMENT_SUCCEEDED:
          const project = await this.projectRepository.findOne({
            select: {
              id: true,
              status: true,
              is_edited: true,
              is_declined: true,
            },
            where: {
              id: project_id,
            },
          });

          const user = await this.UserRepository.findOne({
            where: { id: clientId },
          });

          if (
            project.status !== ProjectStatus.AWARDED &&
            project.status !== ProjectStatus.COMPLETED
          ) {
            const createBillingObj = this.projectBillingRepository.create({
              project: { id: project_id },
              expert: { id: expert_id },
              client: { id: clientId },
              quoted_amount: consultant_amount,
              processing_fees: processing_fees,
              platform_fees: platform_fees,
              payout_completed: 0,
              payout_pending: 0,
            });
            await this.projectBillingRepository.save(createBillingObj);

            const paymentSuccess = await this.userTransactions.create({
              created_by: clientId,
              amount: consultant_amount,
              processing_fees: processing_fees,
              platform_fees: platform_fees,
              transaction_id: transaction_id,
              payment_method: payment_method,
              currency: currency,
              status: PaymentStatus.COMPLETE,
              project_id: { id: project_id },
              transaction_type: TransactionType.Payment,
              user_id: { id: clientId },
            });
            await this.userTransactions.save(paymentSuccess);

            await this.projectService.updateProjectStatus(
              project_id,
              expert_id,
              status,
              user
            );

            await this.notificationService.ProjectAwardedNotifications(
              expert_id,
              project_id,
              user
            );
            await this.awardProjectSendEmail(expert_id);
            return body;
          } else if (
            project.status === ProjectStatus.AWARDED &&
            project.is_edited &&
            !project.is_declined
          ) {
            const projectBilling = await this.projectBillingRepository.findOne({
              select: {
                id: true,
                quoted_amount: true,
                platform_fees: true,
                processing_fees: true,
              },
              where: {
                expert: {
                  id: expert_id,
                },
                client: {
                  id: clientId,
                },
                project: {
                  id: project_id,
                },
              },
            });

            await this.projectBillingRepository.update(
              { id: projectBilling.id },
              {
                quoted_amount:
                  +projectBilling.quoted_amount + +consultant_amount,
                platform_fees: +projectBilling.platform_fees + +platform_fees,
                processing_fees:
                  +projectBilling.processing_fees + +processing_fees,
              }
            );
            const paymentSuccess = await this.userTransactions.create({
              created_by: clientId,
              amount: consultant_amount,
              processing_fees: processing_fees,
              platform_fees: platform_fees,
              transaction_id: transaction_id,
              payment_method: payment_method,
              currency: currency,
              status: PaymentStatus.COMPLETE,
              project_id: { id: project_id },
              transaction_type: TransactionType.Payment,
              user_id: { id: clientId },
            });
            await this.userTransactions.save(paymentSuccess);

            const projectMilestones =
              await this.projectMilestoneRepository.find({
                select: {
                  id: true,
                  status: true,
                  amount: true,
                  temp_amount: true,
                  temp_delete: true,
                  is_temp: true,
                  start_date: true,
                  end_date: true,
                  temp_start_date: true,
                  temp_end_date: true,
                  description: true,
                  temp_description: true,
                },
                where: {
                  project: {
                    id: project_id,
                  },
                  user: {
                    id: expert_id,
                  },
                  status: In([
                    ProjectMilestoneStatus.INPROGRESS,
                    ProjectMilestoneStatus.PENDING,
                  ]),
                },
              });

            await Promise.all(
              projectMilestones.map((item) => {
                if (!item.temp_delete) {
                  return this.projectMilestoneRepository.update(
                    { id: item.id },
                    {
                      amount: item.temp_amount ? item.temp_amount : item.amount,
                      temp_amount: null,
                      start_date: item.temp_start_date
                        ? item.temp_start_date
                        : item.start_date,
                      temp_start_date: null,
                      end_date: item.temp_end_date
                        ? item.temp_end_date
                        : item.end_date,
                      temp_end_date: null,
                      description: item.temp_description
                        ? item.temp_description
                        : item.description,
                      temp_description: null,
                      is_temp: false,
                      temp_delete: false,
                    }
                  );
                } else if (item.temp_delete) {
                  return this.projectMilestoneRepository.delete({
                    id: item.id,
                  });
                }
              })
            );

            await this.projectRepository.update(
              { id: project_id },
              {
                is_edited: false,
                is_declined: false,
                temp_modification_requested: false,
                temp_modification: null,
              }
            );

            const projectExpert = await this.projectExpertRepository.findOne({
              select: {
                id: true,
                proposal_amount: true,
              },
              where: {
                project: {
                  id: project_id,
                },
                user: {
                  id: expert_id,
                },
              },
            });

            await this.projectExpertRepository.update(
              { id: projectExpert.id },
              {
                proposal_amount:
                  +projectExpert.proposal_amount + +consultant_amount,
              }
            );

            return body;
          }
          break;
        case WebhookType.PAYMENT_FAILED:
          const failed_payment_method =
            body.data.object.last_payment_error.payment_method.id;
          const failedPayment = await this.userTransactions.create({
            created_by: clientId,
            amount: consultant_amount,
            processing_fees: processing_fees,
            platform_fees: platform_fees,
            transaction_id: transaction_id,
            payment_method: failed_payment_method,
            currency: currency,
            status: PaymentStatus.FAILED,
            project_id: { id: project_id },
            transaction_type: TransactionType.Payment,
            user_id: { id: clientId },
          });
          await this.userTransactions.save(failedPayment);
        default:
          return body;
      }
    } catch (err) {
      console.error(err);
      throw new Error(`Webhook Error: ${err.message}`);
    }
  }

  /**
   * Send Email with Verification link and code
   * @function awardProjectSendEmail
   * @param {expert_id} expert_id
   * @returns True if successfully
   */
  public async awardProjectSendEmail(expert_id) {
    const user = await this.UserRepository.findOne({
      where: { id: expert_id },
    });

    if (user.email.indexOf("@example.com") !== -1) {
      return true;
    }
    try {
      // const verifyLink = `${generalConfig.applicationHost}/user/client/dashboard`;
      const profileLink = generalConfig.applicationHost;
      const emailData = {
        subject: "you have new award project",
        toAddress: [user.email],
        params: {
          host: generalConfig.applicationHost,
          profileLink,
          title: "Award project Email",
          verifyLink: `${generalConfig.applicationHost}/post`,
          code: "",
          fullName: user.last_name
            ? user.first_name + " " + user.last_name
            : user.first_name,
        },
      };

      const welcome = EmailType.welcome_consultant;

      return await this.emailsService.sendEmailSMTP(emailData, welcome);
    } catch (e) {
      Logger.error(`Unable to send email ${e}`);
      throw new HttpException(
        "Unable to send email. Please try again later",
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  async createStripeExistingCustomer() {
    try {
      const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

      const accountCheck = await this.UserRepository.find({
        where: {
          user_type: UserType.Client,
          is_active: true,
          is_archived: false,
          stripe_customer_id: IsNull(),
          status: UserStatus.ACTIVE,
        },
      });

      let index = 0;

      setInterval(async () => {
        const customer = await stripe.customers.create({
          email: accountCheck[index].email,
          name:
            accountCheck[index].first_name +
            " " +
            (accountCheck[index].last_name || ""),
        });
        await this.UserRepository.update(
          { id: accountCheck[index].id },
          {
            stripe_customer_id: customer.id,
          }
        );
        index++;
      }, 2000);
    } catch (e) {
      console.error(e, "error");
      throw new BadRequestException(
        `Unable to create stripe customer - ${e.message}`
      );
    }
  }

  public async createStripeAccount(
    userId: string,
    name: string,
    email: string
  ) {
    try {
      const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
      const customer = await stripe.customers.create({
        email: email,
        name: name,
      });
      await this.UserRepository.update(
        { id: userId },
        {
          stripe_customer_id: customer.id,
        }
      );
    } catch (e) {
      console.error(e, "error");
      throw new BadRequestException(
        `Unable to create stripe customer - ${e.message}`
      );
    }
  }

  async addCardDetailsinDB(id: string, user: Users) {
    try {
      //To retrieve initial card details from stripe
      const stripeCard = await this.stripeService.retrieveCardDetailsFromStripe(
        id
      );

      const oldCards = await this.userCardRepository.findOne({
        where: {
          user: { id: user.id },
          is_archived: false,
          last4: stripeCard.card.last4,
          exp_month: stripeCard.card.exp_month,
          exp_year: stripeCard.card.exp_year,
        },
      });

      if (oldCards) {
        throw new ConflictException(
          `A card with the same holder details is already attached to this account`
        );
      }
      const userCards = await this.userCardRepository.find({
        where: { user: { id: user.id } },
      });

      const hasPrimaryCard = userCards.some((card) => card.set_primary);

      const setPrimary = hasPrimaryCard ? false : true;

      const cust: Users = await this.UserRepository.findOne({
        where: { id: user.id },
      });
      //attach card to the customer in stripe
      this.stripeService.attachPaymentMethodToCustomer(
        stripeCard.id,
        cust.stripe_customer_id
      );
      //update the new card as primary card in stripe

      const newCard: UserCardDetails = this.userCardRepository.create({
        user: { id: user.id },
        created_by: user.id,
        card_id: stripeCard.id,
        brand: stripeCard.card.brand,
        last4: stripeCard.card.last4,
        exp_month: stripeCard.card.exp_month,
        exp_year: stripeCard.card.exp_year,
        set_primary: setPrimary,
        card_country: stripeCard.card.country,
      });
      const savedCard: Promise<UserCardDetails> =
        this.userCardRepository.save(newCard);
      //add change in steps for page redirection in frontend

      return savedCard;
    } catch (e) {
      if (e instanceof InternalServerErrorException) {
        throw e;
      }
      if (e instanceof ConflictException) {
        throw e;
      }
      throw new BadRequestException(`Unable to save card details- ${e}`);
    }
  }

  public async listcards(user) {
    try {
      const where: FindOptionsWhere<UserCardDetails> = {
        is_active: true,
        is_archived: false,
        created_by: user.id,
      };
      const [data] = await this.userCardRepository.findAndCount({
        select: {
          id: true,
          brand: true,
          card_id: true,
          created_at: true,
          created_by: true,
          exp_month: true,
          exp_year: true,
          is_active: true,
          is_archived: true,
          last4: true,
          set_primary: true,
          updated_at: true,
          updated_by: true,
          user: {
            id: true,
            first_name: true,
            user_name: true,
            last_name: true,
          },
        },
        relations: {
          user: true,
        },
        where,
        order: {
          created_at: "DESC",
        },
      });

      return { data };
    } catch (e) {
      throw new BadRequestException(
        `Unable to fetch card details - ${e.message}`
      );
    }
  }

  /**
   * Service Function to create a setup intent. It is necessary to create a setupintent to initiate
   * save card process of user in stripe. After successful creation of setupIntent, a client secret
   * key is passed to frontend for completing the process
   * @param user current user
   * @returns stripe response
   */
  async setupIntent(user) {
    try {
      const cust = await this.UserRepository.findOne({
        where: { id: user.id },
      });

      const client_secret = await this.stripeService.setupIntentStripe(
        cust.stripe_customer_id
      );

      return { client_secret };
    } catch (e) {
      throw new BadRequestException(
        `Error while creating setupIntent - ${e.message}`
      );
    }
  }

  async listBankAccount(user) {
    try {
      const consultant = await this.UserRepository.findOne({
        where: { id: user.id },
      });
      if (!consultant) throw new NotFoundException("Consultant not found");
      else if (!consultant.connect_id)
        throw new BadRequestException("Consultant not connected to stripe");
      const consultantBankAccount = await this.BankAccountRepository.find({
        where: { connect_id: consultant.connect_id },
        select: {
          account_holder_name: true,
          account_number_last4: true,
          connect_id: true,
          is_primary: true,
          stripe_bank_id: true,
          routing_number: true,
          bank_status: true,
          reason: true,
          status: true,
          country: true,
        },
        order: {
          is_primary: "DESC",
        },
      });

      return consultantBankAccount;
    } catch (e) {
      throw new BadRequestException(
        `Error while creating setupIntent - ${e.message}`
      );
    }
  }

  public async createConnectAccount(data, user) {
    try {
      const userData = await this.UserRepository.findOne({
        where: {
          id: user.id,
          // user_type: UserType.Expert,
          is_active: true,
          status: UserStatus.ACTIVE,
        },
      });

      if (!userData)
        throw new NotFoundException(`Consultant not found with this id`);
      else if (userData.connect_id && userData.is_connect_verified)
        throw new BadRequestException(`Connect id already exists`);
      else if (userData.connect_id && userData.is_connect_verified == false) {
        const redirectLink = await this.stripeService.createLink(
          userData.connect_id,
          data.refresh_url,
          data.return_url
        );
        return redirectLink;
      }
      let timestamp = moment().format("X");
      var ip = require("ip");

      let createData = {
        type: "custom",
        country: "US",
        email: data.email,
        requested_capabilities: ["transfers", "card_payments"],
        business_type: "individual",
        business_profile: {
          mcc: "7392",
        },
        tos_acceptance: {
          date: timestamp,
          ip: ip.address(),
        },
        metadata: {
          user_id: user.id,
          webhook_env: process.env.WEBHOOK_ENV,
          country: data.country.toLowerCase(),
        },
        individual: {
          first_name: data.first_name,
          last_name: data.last_name,
          email: data.email,

          dob: {
            day: data.dob.day,
            month: data.dob.month,
            year: data.dob.year,
          },
        },

        settings: {
          payouts: {
            schedule: {
              interval: "manual",
            },
          },
        },
      };
      if (
        data.country.toLowerCase() !== "ca" &&
        data.country.toLowerCase() !== "us" &&
        data.country.toLowerCase() !== "uk"
      ) {
        throw new BadRequestException("Invalid country");
      }
      if (data.country.toLowerCase() === "ca") {
        createData.country = "CA";
        createData.tos_acceptance["service_agreement"] = "recipient";
      } else if (data.country.toLowerCase() == "uk") {
        createData.country = "GB";
        createData.tos_acceptance["service_agreement"] = "recipient";
      }

      const StripeconnectAccount =
        await this.stripeService.createStripeConnectAccount(createData);
      const updateConnectId = await this.UserRepository.update(
        { id: user.id },
        {
          connect_id: StripeconnectAccount.id,
        }
      );

      if (!updateConnectId)
        throw new BadRequestException(
          "Error while updating consultant account to db"
        );

      if (StripeconnectAccount) {
        const connectDetails = await this.UserConnectsRepository.create({
          connect_id: StripeconnectAccount.id,
          first_name: data.first_name,
          last_name: data.last_name,
          email: data.email,
          reason: "Pending for verification",
          DOB: `${data.dob.day}-${data.dob.month}-${data.dob.year}`,
          country: data.country.toLowerCase(),
        });
        await this.UserConnectsRepository.save(connectDetails);

        const redirectLink = await this.stripeService.createLink(
          StripeconnectAccount.id,
          data.refresh_url,
          data.return_url
        );
        return redirectLink;
      }

      return StripeconnectAccount.id;
    } catch (e) {
      throw new BadRequestException(
        `Error while creating consultant account - ${e.message}`
      );
    }
  }

  public async updateConnectAccount(data, user) {
    try {
      const userData = await this.UserRepository.findOne({
        where: {
          id: user.id,
          //user_type: UserType.Expert,
          is_active: true,
          status: UserStatus.ACTIVE,
        },
      });

      if (!userData)
        throw new NotFoundException(`Consultant not found with this id`);
      else if (!userData.connect_id)
        throw new BadRequestException(`Consultant not connected to stripe`);
      let updateData = {
        email: data.email,
        business_profile: {
          url: data.url,
          mcc: "7392",
        },
        metadata: {
          user_id: user.id,
          webhook_env: process.env.WEBHOOK_ENV,
        },
        individual: {
          first_name: data.first_name,
          last_name: data.last_name,
          ssn_last_4: data.ssn_number,
          email: data.email,
          phone: data.phone_number,
          address: {
            city: data.address.city,
            line1: data.address.line1,
            line2: data.address.line2,
            postal_code: data.address.postal_code,
            state: data.address.state,
          },
          dob: {
            day: data.dob.day,
            month: data.dob.month,
            year: data.dob.year,
          },
        },
      };

      const updateStripeConnectAccount =
        await this.stripeService.updateStripeConnectAccount(
          userData.connect_id,
          updateData
        );

      if (updateStripeConnectAccount) {
        await this.UserConnectsRepository.update(
          { connect_id: updateStripeConnectAccount.id },
          {
            //connect_id: updateStripeConnectAccount.id,
            ssn_last4: data.ssn_number,
            address: data.address.line1,
            address_two: data.address.line2,
            phone_number: data.phone_number,
            first_name: data.first_name,
            last_name: data.last_name,
            email: data.email,
            city: data.address.city,
            state: data.address.state,
            postal_code: data.address.postal_code,
            reason: "Pending for verification",
            DOB: `${data.dob.day}-${data.dob.month}-${data.dob.year}`,
            profle_url: data.url,
          }
        );
      }
      return updateStripeConnectAccount;
    } catch (e) {
      throw new BadRequestException(
        `Error while creating consultant account - ${e.message}`
      );
    }
  }

  public async getConsultantConnectAccount(user) {
    try {
      const userData = await this.UserRepository.findOne({
        where: {
          id: user.id,
          //user_type: UserType.Expert,
          is_active: true,
          status: UserStatus.ACTIVE,
        },
      });

      if (!userData)
        throw new NotFoundException(`Consultant not found with this id`);
      else if (!userData.connect_id)
        throw new BadRequestException(`Consultant not connected to stripe`);
      const connect = await this.UserConnectsRepository.createQueryBuilder(
        "userConnect"
      )

        .where("userConnect.connect_id = :connect_id", {
          connect_id: userData.connect_id,
        })
        .select([
          "userConnect.first_name AS first_name",
          "userConnect.last_name AS last_name",
          "userConnect.DOB AS DOB",
          "userConnect.email AS email",
          "userConnect.reason AS reason ",
          "userConnect.country AS country ",
          "userConnect.verification_status AS verification_status",
        ])
        .getRawOne();

      return connect;
    } catch (e) {
      throw new BadRequestException(
        `Error while fetching consultant account - ${e.message}`
      );
    }
  }

  public async addBankAccount(data, user) {
    try {
      const connectId = await this.UserRepository.findOne({
        where: {
          id: user.id,
        },
      });
      if (!connectId.connect_id)
        throw new BadRequestException("User not connected to stripe");

      let bankData = {
        object: "bank_account",
        country: "US",
        currency: "usd",
        account_holder_name: data.account_holder_name,
        account_number: data.account_number,
        routing_number: data.routing_number,
      };
      if (
        data.country.toLowerCase() !== "ca" &&
        data.country.toLowerCase() !== "us" &&
        data.country.toLowerCase() !== "uk"
      ) {
        throw new BadRequestException("Invalid country");
      }
      if (data.country.toLowerCase() === "ca") {
        bankData.country = "CA";
        bankData.currency = "cad";
      } else if (data.country.toLowerCase() == "uk") {
        bankData.country = "GB";
        bankData.currency = "gbp";
      }
      const accountLast4 = data.account_number.slice(-4);
      const stripeAddBank = await this.stripeService.stripeAddBank(
        bankData,
        connectId.connect_id
      );

      if (stripeAddBank) {
        const bankDetails = await this.BankAccountRepository.create({
          connect_id: connectId.connect_id,
          stripe_bank_id: stripeAddBank.id,
          bank_status: stripeAddBank.status,
          account_holder_name: data.account_holder_name,
          account_number_last4: accountLast4,
          routing_number: data.routing_number,
          is_primary: stripeAddBank.default_for_currency,
          reason: "",
          country: data.country.toLowerCase(),
        });
        const created = await this.BankAccountRepository.save(bankDetails);
      }
      return stripeAddBank;
    } catch (e) {
      throw new BadRequestException(
        `Error while creating consultant account - ${e.message}`
      );
    }
  }
  public async setPrimaryBank(data, user) {
    try {
      const connectId = await this.UserRepository.findOne({
        where: {
          id: user.id,
        },
      });
      if (!connectId.connect_id)
        throw new BadRequestException("User not connected to stripe");
      const setPrimary = await this.stripeService.setPrimaryBank(
        connectId.connect_id,
        data.external_account
      );

      if (setPrimary) {
        await this.BankAccountRepository.update(
          {
            stripe_bank_id: Not(data.external_account),
            connect_id: connectId.connect_id,
          },
          { is_primary: false }
        );

        await this.BankAccountRepository.update(
          {
            stripe_bank_id: data.external_account,
            connect_id: connectId.connect_id,
          },
          { is_primary: true }
        );
      }

      return setPrimary;
    } catch (e) {
      throw new BadRequestException(
        `Error while setting primary account - ${e.message}`
      );
    }
  }
  public async deleteConnectId(id) {
    try {
      const deleteConnect = await this.stripeService.deleteConnectId(
        id.connect_id
      );
      if (deleteConnect) {
        await this.UserRepository.update(
          { connect_id: id.connect_id },
          { connect_id: null, is_connect_verified: false }
        );
        await this.BankAccountRepository.delete({
          connect_id: id.connect_id,
        });
        await this.UserConnectsRepository.delete({
          connect_id: id.connect_id,
        });
      }
      return deleteConnect;
    } catch (e) {
      throw new BadRequestException(
        `Error while deleting connect account - ${e.message}`
      );
    }
  }
  public async viewBank(bankId, user) {
    try {
      const connect = await this.UserRepository.findOne({
        where: {
          id: user.id,
        },
      });
      const bank = await this.BankAccountRepository.findOne({
        where: {
          stripe_bank_id: bankId.id,
          connect_id: connect.connect_id,
        },
      });
      if (!bank) throw new BadRequestException(`Bank id not found`);
      const viewBank = await this.stripeService.viewBank(
        bankId.id,
        bank.connect_id
      );

      return viewBank;
    } catch (e) {
      throw new BadRequestException(
        `Error while fetching connect account - ${e.message}`
      );
    }
  }

  public async deleteBank(bankId, user) {
    try {
      const connect = await this.UserRepository.findOne({
        where: {
          id: user.id,
        },
      });
      const bank = await this.BankAccountRepository.findOne({
        where: {
          stripe_bank_id: bankId.id,
          connect_id: connect.connect_id,
        },
      });

      if (!bank) throw new BadRequestException(`Bank id not found`);
      const deleteBank = await this.stripeService.deleteBank(
        bankId.id,
        connect.connect_id
      );
      if (deleteBank) {
        await this.BankAccountRepository.delete({
          stripe_bank_id: bankId.id,
          connect_id: connect.connect_id,
        });
      }
      return deleteBank;
    } catch (e) {
      throw new BadRequestException(
        `Error while updating connect account - ${e.message}`
      );
    }
  }
  async expertTransaction(filter, sort, range, user) {
    try {
      const where: FindOptionsWhere<UserTransactions> = {
        user_id: {
          user_type: UserType.Expert,
          id: user.id,
        },
      };

      const order = {};

      if (sort?.length > 0) {
        order[sort[0]] = sort[1];
      }

      if (filter.status === 0 || filter?.status) {
        where.status = filter?.status;
      }

      // if (filter.created_at_gte)
      // {
      //   where.created_at = MoreThanOrEqual(new Date(filter.created_at_gte));
      // }

      // if (filter.created_at_lte) {
      //   where.created_at = LessThanOrEqual(new Date(filter.created_at_lte));
      // }
      if (filter.created_at_gte && filter.created_at_lte) {
        where.created_at = Between(
          new Date(filter.created_at_gte),
          new Date(filter.created_at_lte)
        );
      } else if (filter.created_at_gte) {
        where.created_at = MoreThanOrEqual(new Date(filter.created_at_gte));
      } else if (filter.created_at_lte) {
        where.created_at = LessThanOrEqual(new Date(filter.created_at_lte));
      }

      const [data, total] = await this.userTransactions.findAndCount({
        select: {
          id: true,
          transaction_id: true,
          status: true,
          project_id: {
            id: true,
            title: true,
          },
          user_id: {
            id: true,
            first_name: true,
          },
          created_at: true,
          currency: true,
          amount: true,
          platform_fees: true,
          processing_fees: true,
          payment_method: true,
          transaction_type: true,
        },
        relations: {
          user_id: true,
          project_id: true,
        },
        where,
        order,
        skip: range?.[0] || 0,
        take: range?.[1] || 10,
      });
      return { data, total };
    } catch (error) {
      throw new BadRequestException(
        `Error while fetching data ${error.message}`
      );
    }
  }

  async clientTransaction(filter, sort, range, user) {
    try {
      const where: FindOptionsWhere<UserTransactions> = {
        user_id: {
          user_type: UserType.Client,
          id: user.id,
        },
      };

      const order = {};

      if (sort?.length > 0) {
        order[sort[0]] = sort[1];
      }

      if (filter.status === 0 || filter?.status) {
        where.status = filter?.status;
      }

      // if (filter.created_at_gte) {
      //   where.created_at = MoreThanOrEqual(new Date(filter.created_at_gte));
      // }

      // if (filter.created_at_lte) {
      //   where.created_at = LessThanOrEqual(new Date(filter.created_at_lte));
      // }

      if (filter.created_at_gte && filter.created_at_lte) {
        where.created_at = Between(
          new Date(filter.created_at_gte),
          new Date(filter.created_at_lte)
        );
      } else if (filter.created_at_gte) {
        where.created_at = MoreThanOrEqual(new Date(filter.created_at_gte));
      } else if (filter.created_at_lte) {
        where.created_at = LessThanOrEqual(new Date(filter.created_at_lte));
      }

      const [data, total] = await this.userTransactions.findAndCount({
        select: {
          id: true,
          transaction_id: true,
          status: true,
          project_id: {
            id: true,
            title: true,
          },
          user_id: {
            id: true,
            first_name: true,
          },
          created_at: true,
          currency: true,
          amount: true,
          platform_fees: true,
          processing_fees: true,
          payment_method: true,
          transaction_type: true,
        },
        relations: {
          user_id: true,
          project_id: true,
        },
        where,
        order,
        skip: range?.[0] || 0,
        take: range?.[1] || 10,
      });
      return { data, total };
    } catch (error) {
      throw new BadRequestException(
        `Error while fetching data ${error.message}`
      );
    }
  }

  async listPlatformPayout(filter, sort, range) {
    try {
      const where: FindOptionsWhere<PlatformPayout> = {};

      const order = {};

      if (sort?.length > 0) {
        order[sort[0]] = sort[1];
      }

      if (filter?.payout_status) {
        where.payout_status = filter?.payout_status;
      }

      if (filter.created_at_gte && filter.created_at_lte) {
        where.created_at = Between(
          new Date(filter.created_at_gte),
          new Date(filter.created_at_lte)
        );
      } else if (filter.created_at_gte) {
        where.created_at = MoreThanOrEqual(new Date(filter.created_at_gte));
      } else if (filter.created_at_lte) {
        where.created_at = LessThanOrEqual(new Date(filter.created_at_lte));
      }

      const [data, total] = await this.platformPayoutRepository.findAndCount({
        select: {
          id: true,
          created_at: true,
          payout_status: true,
          transaction_id: true,
          transferred_amount: true,
        },
        where,
        order,
        skip: range?.[0] || 0,
        take: range?.[1] || 10,
      });
      return { data, total };
    } catch (error) {
      throw new BadRequestException(
        `Error while fetching data ${error.message}`
      );
    }
  }

  /**
   * @function						: milestoneTemptoMain
   * @param							  :
   * @param							  :
   * @returns							:
   * @date 								: 12/12/2023
   * @description				  :
   * @author							: Anu J Pillai
   */

  async milestoneTemptoMain(
    requestMilestoneIds: string[],
    project_id: string,
    expert_id: string,
    updated_project_fee: number
  ): Promise<void> {
    try {
      const milestonesToUpdate = await this.projectMilestoneRepository.find({
        where: { id: In(requestMilestoneIds) },
      });

      for (const milestone of milestonesToUpdate) {
        const updateFields: Record<string, any> = {};

        if (milestone.temp_amount !== null) {
          updateFields.amount = Number(milestone.temp_amount);
          updateFields.temp_amount = null;
        }

        if (milestone.is_temp === true) {
          updateFields.is_temp = false;
        }

        if (milestone.temp_start_date !== null) {
          updateFields.start_date = milestone.temp_start_date;
          updateFields.temp_start_date = null;
        }

        if (milestone.temp_end_date !== null) {
          updateFields.end_date = milestone.temp_end_date;
          updateFields.temp_end_date = null;
        }

        if (milestone.temp_description !== null) {
          updateFields.description = milestone.temp_description;
          updateFields.temp_description = null;
        }

        if (milestone.is_payment_requested === true) {
          milestone.payment_status = MilestonePaymentStatus.PAID;
          milestone.is_payment_requested = false;
        }

        await this.projectMilestoneRepository.update(
          { id: milestone.id },
          updateFields
        );
      }

      await this.projectBillingRepository.update(
        { project: { id: project_id }, expert: { id: expert_id } },
        {
          quoted_amount: updated_project_fee,
        }
      );

      await this.projectRepository.update(
        { id: project_id },
        {
          is_edited: false,
          is_declined: false,
          temp_modification: null,
          temp_modification_requested: false,
        }
      );

      await this.projectExpertRepository.update(
        { project: { id: project_id }, user: { id: expert_id } },
        {
          proposal_amount: updated_project_fee,
        }
      );

      const checkMilestone = await this.projectMilestoneRepository.find({
        where: {
          project: { id: project_id },
          user: { id: expert_id },
        },
        relations: { user: true, project: true },
      });
      const allMilestonesPaid = checkMilestone.every(
        (milestone) => milestone.payment_status === MilestonePaymentStatus.PAID
      );
      if (allMilestonesPaid) {
        await this.updateProjectAndExpertStatus(project_id, expert_id);
      }
    } catch (error) {
      throw new BadRequestException(
        `Failed to update milestone(s): ${error.message}`
      );
    }
  }
  /**
   * @function						: refundPayment
   * @param							  :
   * @param							  :
   * @returns							:
   * @date 								: 11/12/2023
   * @description				  :
   * @author							: Anu J Pillai
   */
  async refundPayment(
    amount: number,
    project_id: string,
    clientId: string,
    expect_id: string,
    updated_project_fee,
    milestoneIds: string[]
  ): Promise<void> {
    try {
      const projectPayment = await this.userTransactions.findOne({
        where: {
          project_id: { id: project_id },
          user_id: { id: clientId },
          transaction_type: TransactionType.Payment,
          status: PaymentStatus.COMPLETE,
        },
      });

      if (!projectPayment) {
        throw new NotFoundException("Project payment not found.");
      }

      const transaction_id = projectPayment.transaction_id;
      const refundStatus = await this.stripeService.refundAmount(
        transaction_id,
        amount
      );

      let PaymentStatusCheck = PaymentStatus.FAILED;

      if (refundStatus.status === "succeeded") {
        await this.milestoneTemptoMain(
          milestoneIds,
          project_id,
          expect_id,
          updated_project_fee
        );
        PaymentStatusCheck = PaymentStatus.COMPLETE;
      } else if (refundStatus.status === "failed") {
        throw new BadRequestException("Refund has failed.");
      }

      const transaction = this.userTransactions.create({
        created_by: clientId,
        amount: refundStatus.amount,
        processing_fees: refundStatus.processing_fees,
        platform_fees: refundStatus.platform_fees,
        transaction_id: refundStatus.id,
        payment_method: projectPayment.payment_method,
        currency: refundStatus.currency,
        status: PaymentStatusCheck,
        project_id: { id: project_id },
        transaction_type: TransactionType.Refund,
        user_id: { id: clientId },
      });

      await this.userTransactions.save(transaction);
    } catch (error) {
      throw new BadRequestException(`Refund failed: ${error.message}`);
    }
  }

  async updateProjectAndExpertStatus(
    project_id: string,
    expert_id: string
  ): Promise<void> {
    const promises = [];

    const projectUpdatePromise = this.projectRepository.update(
      { id: project_id },
      { status: ProjectStatus.COMPLETED }
    );

    const projectExpertUpdatePromise = this.projectExpertRepository.update(
      { user: { id: expert_id }, project: { id: project_id } },
      { status: ProjectExpertStatus.COMPLETED }
    );

    promises.push(projectUpdatePromise, projectExpertUpdatePromise);

    await Promise.all(promises);
  }

  /**
   * @function						: approveUpdatedMilestone
   * @param							  : milestone ids
   * @param							  :
   * @returns							: milestone approved success message
   * @date 								: 08/12/2023
   * @description				  : API used to approve updated milestone that is requested by consultant for payment.
   * @author							: Anu J Pillai
   */
  async approveUpdatedMilestone(project_id: string, expert_id: string, user) {
    try {
      const projectBill = await this.projectBillingRepository.findOne({
        where: { project: { id: project_id }, expert: { id: expert_id } },
        relations: ["project", "expert"],
      });

      const milestones = await this.projectMilestoneRepository.find({
        where: {
          project: { id: project_id },
          user: { id: expert_id },
          temp_delete: false,
        },
        relations: { user: true, project: true },
      });

      if (milestones.length === 0) {
        throw new BadRequestException("No milestone(s) found!");
      }

      const requestMilestoneIds = milestones.map((milestone) => milestone.id);

      const updated_project_fee = milestones.reduce((sum, milestone) => {
        const amount =
          milestone.temp_amount !== null
            ? Number(milestone.temp_amount)
            : Number(milestone.amount) || 0;

        return sum + amount;
      }, 0);

      if (projectBill.quoted_amount == updated_project_fee) {
        this.milestoneTemptoMain(
          requestMilestoneIds,
          project_id,
          expert_id,
          updated_project_fee
        );
      }

      const ClientId = await this.UserRepository.findOne({
        where: { id: user.id },
      });

      if (Number(projectBill.quoted_amount) > updated_project_fee) {
        const refundAmount = projectBill.quoted_amount - updated_project_fee;

        await this.refundPayment(
          refundAmount,
          project_id,
          ClientId.id,
          expert_id,
          updated_project_fee,
          requestMilestoneIds
        );
      }
      const project = await this.projectRepository.findOne({
        where: { id: project_id },
      });
      let clientName = user.first_name + "" + user.last_name;
      this.notificationService.awardMilestoneApproved(
        project_id,
        expert_id,
        user,
        project.title,
        clientName
      );
      return;
    } catch (error) {
      throw new BadRequestException(
        `Approving Milestone has failed - ${error.message}`
      );
    }
  }
}
