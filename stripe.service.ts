/* eslint-disable */
import { Users } from '@app/authentication/models/users.entity';
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

@Injectable()
export class StripeService {
  constructor(
    @InjectRepository(Users)
    private usersRepository: Repository<Users>
  ) {}

  async retrieveCardDetailsFromStripe(card_id: string) {
    try {
      const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
      const newStripeCard = await stripe.paymentMethods.retrieve(card_id);
      return newStripeCard;
    } catch (e) {
      throw new BadRequestException(`${e.message}`);
    }
  }

  async createPayout(amount, stripe_bank_id, connect_id, expert_id) {
    try {
      const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
      const transfer = await stripe.transfers.create({
        amount: Math.round(amount * 100),
        currency: 'usd',
        destination: connect_id,
      });
      const balance = await stripe.balance.retrieve({
        stripeAccount: connect_id,
      });
      const createPayout = await stripe.payouts.create(
        {
          currency: balance.available[0].currency,
          destination: stripe_bank_id,
          amount: balance.available[0].amount,
          metadata: {
            webhook_env: process.env.WEBHOOK_ENV,
            expert_id: expert_id,
            amount: amount,
            transfer_id: transfer.id,
            currency_amount: balance.available[0].amount,
          },
        },
        {
          stripeAccount: connect_id,
        }
      );
      return createPayout;
    } catch (e) {
      throw new BadRequestException(`${e.message}`);
    }
  }
  async stripeAddBank(bankData, connectId: string) {
    try {
      const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
      const bankAccount = await stripe.accounts.createExternalAccount(connectId, {
        external_account: bankData,
      });
      return bankAccount;
    } catch (e) {
      throw new BadRequestException(`${e.message}`);
    }
  }

  async viewBank(id, connectId) {
    try {
      const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
      const bankAccount = await stripe.accounts.retrieveExternalAccount(connectId, id);
      return bankAccount;
    } catch (e) {
      throw new BadRequestException(`${e.message}`);
    }
  }

  async createLink(connectId, refresh_url, return_url) {
    try {
      const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

      const accountLink = await stripe.accountLinks.create({
        account: connectId,
        refresh_url: refresh_url,
        return_url: return_url,
        type: 'account_onboarding',
        collect: 'eventually_due',
      });
      return accountLink;
    } catch (e) {
      throw new BadRequestException(`${e.message}`);
    }
  }

  async deleteBank(id, connectId) {
    try {
      const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
      const bankAccount = await stripe.accounts.deleteExternalAccount(connectId, id);
      return bankAccount;
    } catch (e) {
      throw new BadRequestException(`${e.message}`);
    }
  }

  async setPrimaryBank(connectId: string, primaryBank) {
    try {
      const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
      const setPrimary = await stripe.accounts.updateExternalAccount(connectId, primaryBank, {
        default_for_currency: true,
      });
      return setPrimary;
    } catch (e) {
      throw new BadRequestException(`${e.message}`);
    }
  }

  async consultantBankAccount(connect_id: string) {
    try {
      const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
      const bankAccounts = await stripe.accounts.listExternalAccounts(connect_id, {
        object: 'bank_account',
      });
      return bankAccounts;
    } catch (e) {
      throw new BadRequestException(`${e.message}`);
    }
  }

  async reverseTransfer(transfer_id) {
    try {
      const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
      const reversal = await stripe.transfers.createReversal(transfer_id);
      return reversal;
    } catch (e) {
      throw new BadRequestException(`${e.message}`);
    }
  }

  async attachPaymentMethodToCustomer(pi_id: string, cust_id: string) {
    try {
      const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
      const paymentMethod = await stripe.paymentMethods.attach(pi_id, { customer: cust_id });
      return paymentMethod;
    } catch (e) {
      throw new BadRequestException(`${e.message}`);
    }
  }

  async createStripeConnectAccount(data) {
    try {
      const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
      const customconnect = await stripe.accounts.create(data);
      return customconnect;
    } catch (e) {
      throw new BadRequestException(`${e.message}`);
    }
  }

  async updateStripeConnectAccount(id, data) {
    try {
      const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
      return await stripe.accounts.update(id, data);
    } catch (e) {
      throw new BadRequestException(`${e.message}`);
    }
  }

  async setupIntentStripe(user_sid: string) {
    try {
      const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
      const session = await stripe.setupIntents.create({
        payment_method_types: ['card'],
        customer: user_sid,
      });

      return session.client_secret;
    } catch (e) {
      throw new BadRequestException(`${e.message}`);
    }
  }
  async cardInfo(card_id) {
    try {
      const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

      const paymentMethod = await stripe.paymentMethods.retrieve(card_id);

      return paymentMethod;
    } catch (e) {
      throw new BadRequestException(`${e.message}`);
    }
  }
  public async createStripeCustomer(userId: string, name: string, email: string) {
    try {
      const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
      const customer = await stripe.customers.create({
        email: email,
        name: name,
      });
      await this.usersRepository.update(
        { id: userId },
        {
          stripe_customer_id: customer.id,
        }
      );
      return customer.id;
    } catch (e) {
      throw new BadRequestException(`${e.message}`);
    }
  }
  async deleteConnectId(id) {
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

    const deleted = await stripe.accounts.del(id);
    return deleted;
  }

  async refundAmount(payment_intent: string, amount: Number) {
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    const refundStatus = await stripe.refunds.create({
      payment_intent: payment_intent,
      amount: amount,
    });
    return refundStatus;
  }

  calcTotalStripeAmount(
    proposal_amount: number,
    platform_fees: number,
    international_charge: number
  ): number {
    return +(
      (proposal_amount + platform_fees + 0.3) /
      (1 - (0.029 + international_charge))
    ).toFixed(2);
  }

  calcStripeProcessingFee(amount: number, international_charge: number): number {
    return +(amount * (0.029 + international_charge) + 0.3).toFixed(2);
  }
}
