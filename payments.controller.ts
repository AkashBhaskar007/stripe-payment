import {
  Body,
  Controller,
  Post,
  UseGuards,
  Headers,
  Req,
  RawBodyRequest,
  Param,
  Get,
  Query,
  HttpStatus,
  Patch,
  Delete,
  BadRequestException,
} from '@nestjs/common';

import { PaymentsService } from './payments.service';
import { Request } from 'express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiInternalServerErrorResponse,
  ApiOkResponse,
  ApiOperation,
} from '@nestjs/swagger';
import {
  CardResponseDto,
  AddCardDto,
  CardListResponse,
  CreatePaymentDto,
  DeleteConnectDto,
  CreateConnectAccountDTO,
  BankAccountDTO,
  PrimaryBankAccountDTO,
  BankId,
  EditConnectAccountDTO,
  ExpertTransactionFilterDto,
  ExpertTransactionResBaseDto,
  CardDto,
  PlatformPayoutTransactionFilterDto,
  ListPlatformPayoutResBaseDto,
} from './payments.dto';
import { JwtAuthGuard } from '@app/authentication/auth/auth.guard';
import { CurrentUser } from '@app/authentication/auth/auth.decorator';

@Controller('payment')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @ApiOperation({
    tags: ['Payout'],
    summary: 'Create payout for consultant',
    description: 'API to create payout for consultant',
  })
  @Post('/create-payout/:token')
  async createPayout(@Param('token') token: string) {
    if (token !== process.env.PAYMENT_CRON_TOKEN)
      throw new BadRequestException('unauthorized token not valid');

    const data = await this.paymentsService.createPayout();
    return {
      message: 'Consultant payout created successfully',
      statusCode: 200,
      data,
    };
  }

  @ApiOperation({
    tags: ['Stripe Connect'],
    summary: 'Connect consultant to stripe',
    description: 'API to connect consultant to stripe',
  })
  @ApiCreatedResponse({ description: 'Returns consultant stripe account id' })
  @ApiInternalServerErrorResponse({
    description: 'Response with error object when unable to connect consultant to stripe',
  })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('/consultant-connect-account')
  async consultantConnectAccount(@Body() dataForm: CreateConnectAccountDTO, @CurrentUser() user) {
    const data = await this.paymentsService.createConnectAccount(dataForm, user);
    return {
      message: 'Payout details saved, redirecting...',
      statusCode: 200,
      data,
    };
  }

  @ApiOperation({
    tags: ['Stripe Connect'],
    summary: 'Update connect consultant',
    description: 'API to update connect consultant',
  })
  @ApiCreatedResponse({ description: 'Returns success message' })
  @ApiInternalServerErrorResponse({
    description: 'Response with error object when unable to update connect consultant ',
  })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Patch('/consultant-connect-account')
  async updateconsultantConnectAccount(
    @Body() dataForm: EditConnectAccountDTO,
    @CurrentUser() user
  ) {
    const data = await this.paymentsService.updateConnectAccount(dataForm, user);
    return {
      message: 'Updated consultant connect successfully',
      statusCode: 200,
      data,
    };
  }

  @ApiOperation({
    tags: ['Stripe Connect'],
    summary: 'Get consultant connect details',
    description: 'API get consultant connect details',
  })
  @ApiCreatedResponse({ description: 'Returns consultant connect details' })
  @ApiInternalServerErrorResponse({
    description: 'Response with error object when unable to fetch details',
  })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('/consultant-connect-account')
  async getConsultantConnectAccount(@CurrentUser() user) {
    const data = await this.paymentsService.getConsultantConnectAccount(user);
    return {
      message: 'Fetched details successfully',
      statusCode: 200,
      data,
    };
  }

  @ApiOperation({
    tags: ['Bank'],
    summary: 'Add consultant bank account',
    description: 'API to add consultant bank account',
  })
  @ApiCreatedResponse({ description: 'Returns consultant stripe account id' })
  @ApiInternalServerErrorResponse({
    description: 'Response with error object when unable to add consultant bank account',
  })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('/consultant-bank-account')
  async addBankAccount(@Body() dataForm: BankAccountDTO, @CurrentUser() user) {
    const data = await this.paymentsService.addBankAccount(dataForm, user);
    return {
      message: 'Bank account added successfully',
      statusCode: 200,
      data,
    };
  }

  @ApiOperation({
    tags: ['Bank'],
    summary: 'Set primary bank account',
    description: 'API to set primary bank account',
  })
  @ApiCreatedResponse({ description: 'Returns success response' })
  @ApiInternalServerErrorResponse({
    description: 'Response with error object when unable to set primary bank account',
  })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('/set-primary-bank')
  async setPrimaryBank(@Query() dataForm: PrimaryBankAccountDTO, @CurrentUser() user) {
    const data = await this.paymentsService.setPrimaryBank(dataForm, user);
    return {
      message: 'Primary bank account updated',
      statusCode: 200,
      data,
    };
  }

  @ApiOperation({
    tags: ['Payment'],
    summary: 'Delete consultant connect account',
    description: 'API to delete consultant connect account',
  })
  @ApiCreatedResponse({ description: 'Returns consultant deleted stripe account id' })
  @ApiInternalServerErrorResponse({
    description: 'Response with error object when unable to delete consultant connect account',
  })
  @Delete('/delete-connect-account')
  async deleteConnectId(@Query() param: DeleteConnectDto) {
    const data = await this.paymentsService.deleteConnectId(param);
    return {
      message: 'Connect account deleted',
      statusCode: 200,
      data,
    };
  }

  @ApiOperation({
    tags: ['Payment'],
    summary: 'Add consultant bank to complete payment',
  })
  @ApiCreatedResponse({ description: 'Returns payment status' })
  @ApiInternalServerErrorResponse({
    description: 'Response with error object when unable to complete payment',
  })
  @ApiBody({ type: CreatePaymentDto })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('/pay')
  async createPaymentIntent(@Body() projectDetails: CreatePaymentDto, @CurrentUser() user) {
    const data = await this.paymentsService.createPaymentIntent(projectDetails, user);
    return data;
  }

  @ApiOperation({
    tags: ['Payment'],
    summary: 'View payment billing summary',
    description: 'API to view payment billing summary',
  })
  @ApiInternalServerErrorResponse({
    description: 'Response with error object when unable to fetch billing summary',
  })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('/summary/:projectId/:expertId')
  async billingSummary(
    @Param('projectId') projectId: string,
    @Param('expertId') expertId: string,
    @Query() params: CardDto,
    @CurrentUser() user
  ) {
    const card = params.cardId && JSON.parse(params.cardId);

    const data = await this.paymentsService.billingSummary(expertId, projectId, user, card);
    return {
      message: 'Fetched billing summary',
      statusCode: 200,
      data,
    };
  }

  @ApiOperation({
    tags: ['Card'],
    summary: 'Create SetupIntent to save card for future user',
    description: 'API to create setupintent to save card details of the user for future use',
  })
  @ApiOkResponse({ type: CardResponseDto })
  @Post('/setup')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async setup(@CurrentUser() user) {
    const data = await this.paymentsService.setupIntent(user);

    return {
      message: 'Client Secret Key retrieved',
      statusCode: HttpStatus.OK,
      data,
    };
  }

  @ApiOperation({
    tags: ['Bank'],
    summary: 'List consultant bank accounts',
    description: 'API to list consultant bank accounts',
  })
  @Get('/list-bank-account')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async listBankAccount(@CurrentUser() user) {
    const data = await this.paymentsService.listBankAccount(user);
    return {
      message: 'Consultant bank account fetched',
      statusCode: HttpStatus.OK,
      data,
    };
  }

  @ApiOperation({
    tags: ['Payment'],
    summary: 'webhook for updating payment status',
    description: 'webhook for updating payment status',
  })
  @Post('/payment-update')
  async handleWebhookPaymentUpdate(@Req() req: Request) {
    try {
      const body = req.body;
      const webhookType = body.data.object.metadata.webhook_env;
      if (webhookType != process.env.WEBHOOK_ENV) {
        return { message: `${webhookType} webhook` };
      }
      const data = await this.paymentsService.handlePaymentWebhook(body);
      return { data: data };
    } catch (err) {
      console.error('Webhook Error:', err.message);
      throw new Error(`Webhook Error: ${err.message}`);
    }
  }

  @ApiOperation({
    tags: ['Payment'],
    summary: 'webhook for payout processed',
    description: 'webhook for payout processed',
  })
  @Post('/payout-create')
  async handlePayoutCreatedWebhook(@Req() req: Request) {
    try {
      const body = req.body;
      const webhookType = body.data.object.metadata.webhook_env;
      if (webhookType != process.env.WEBHOOK_ENV) {
        return { message: `${webhookType} webhook` };
      }
      await this.paymentsService.handlePayoutCreatedWebhook(body);
      return { success: true };
    } catch (err) {
      console.error('Webhook Error:', err.message);
      throw new Error(`Webhook Error: ${err.message}`);
    }
  }

  @ApiOperation({
    tags: ['Payment'],
    summary: 'webhook for updating payout status',
    description: 'webhook for updating payout status',
  })
  @Post('/payout-update')
  async handleWebhookPayoutUpdate(@Req() req: Request) {
    try {
      const body = req.body;
      const webhookType = body.data.object.metadata.webhook_env;
      if (webhookType != process.env.WEBHOOK_ENV) {
        return { message: `${webhookType} webhook` };
      }
      await this.paymentsService.handlePayoutCompleteWebhook(body);
      return { success: true };
    } catch (err) {
      console.error('Webhook Error:', err.message);
      throw new Error(`Webhook Error: ${err.message}`);
    }
  }

  @ApiOperation({
    tags: ['Payment'],
    summary: 'webhook for saving platform payout status',
    description: 'webhook for saving platform payout status',
  })
  @Post('/platform-payout')
  async platformPayout(@Req() req: Request) {
    try {
      const body = req.body;
      await this.paymentsService.platformPayout(body);
      return { success: true };
    } catch (err) {
      console.error('Webhook Error:', err.message);
      throw new Error(`Webhook Error: ${err.message}`);
    }
  }

  @ApiOperation({
    tags: ['Payment'],
    summary: 'webhook for updating stripe connect status',
    description: 'webhook for updating stripe connect status',
  })
  @Post('/stripe-update')
  async handleWebhookStripeUpdate(@Req() req: Request) {
    try {
      const body = req.body;
      const webhookType = body.data.object.metadata.webhook_env;
      if (webhookType != process.env.WEBHOOK_ENV) {
        return { message: `${webhookType} webhook` };
      }
      await this.paymentsService.handleStripeWebhook(body);
      return { success: true };
    } catch (err) {
      console.error('Webhook Error:', err.message);
      throw new Error(`Webhook Error: ${err.message}`);
    }
  }

  @ApiOperation({
    tags: ['Payment'],
    summary: 'Create existing stripe customer',
    description: 'API to create existing stripe customer',
  })
  @Post('/create-stripe-existing-customer')
  async createStripeExistingCustomer() {
    try {
      const stripeData = await this.paymentsService.createStripeExistingCustomer();
      return { message: 'Stripe customer created', statuCode: HttpStatus.OK, data: stripeData };
    } catch (err) {
      throw new Error(`Error while creating stripe customer: ${err.message}`);
    }
  }

  @ApiOperation({
    tags: ['Payment'],
    summary: 'Save Card details',
    description: 'API to save card details of the user. id is stripe-id of the card',
  })
  @ApiOkResponse({ type: CardResponseDto })
  @Post('/:cardId')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async addcard(@Param() { cardId }: AddCardDto, @CurrentUser() user) {
    const data = await this.paymentsService.addCardDetailsinDB(cardId, user);
    return {
      message: 'Card details saved',
      statusCode: HttpStatus.OK,
      data,
    };
  }

  @ApiOperation({
    tags: ['Payment'],
    summary: 'List all Cards of user',
    description: 'API to get details of all cards that belong to a user',
  })
  @ApiOkResponse({ type: CardListResponse })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('cards-list')
  async listcards(@CurrentUser() user): Promise<CardListResponse> {
    const { data } = await this.paymentsService.listcards(user);
    return {
      statusCode: 200,
      message: `Fetched all cards of the user`,
      data,
    };
  }

  @ApiOperation({
    tags: ['Bank'],
    summary: 'Retrieve a bank account',
    description: 'API to retreive bank account',
  })
  @ApiCreatedResponse({ description: 'Returns success response' })
  @ApiInternalServerErrorResponse({
    description: 'Response with error object when unable to retreive bank account',
  })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('view/bank')
  async viewBank(@Query() bankId: BankId, @CurrentUser() user) {
    const data = await this.paymentsService.viewBank(bankId, user);
    return {
      message: 'Bank account fetched successfully',
      statusCode: 200,
      data,
    };
  }

  @ApiOperation({
    tags: ['Bank'],
    summary: 'Update a bank account',
    description: 'API to update bank account',
  })
  @ApiCreatedResponse({ description: 'Returns success response' })
  @ApiInternalServerErrorResponse({
    description: 'Response with error object when unable to udpate bank account',
  })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Delete('delete/bank')
  async deleteBank(@Query() bankId: BankId, @CurrentUser() user) {
    const data = await this.paymentsService.deleteBank(bankId, user);
    return {
      message: 'Bank account deleted successfully',
      statusCode: 200,
      data,
    };
  }
  @ApiOperation({
    tags: ['Payment'],
    summary: 'List all transaction of experts',
    description: 'API to get all transaction of experts',
  })
  @ApiOkResponse({ type: ExpertTransactionResBaseDto })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('expert-transaction')
  async expertTransactions(
    @Query() params: ExpertTransactionFilterDto,
    @CurrentUser() user
  ): Promise<any> {
    const filter = params.filter && JSON.parse(params.filter);
    const sort = params.sort && JSON.parse(params.sort);
    const range = params.range && JSON.parse(params.range);
    const { data, total } = await this.paymentsService.expertTransaction(filter, sort, range, user);
    return {
      statusCode: 200,
      message: `Fetched all expert transactions`,
      data,
      total,
    };
  }

  @ApiOperation({
    tags: ['Payment'],
    summary: 'List all transaction of clients',
    description: 'API to get all transaction of clients',
  })
  @ApiOkResponse({ type: ExpertTransactionResBaseDto })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('client-transaction')
  async clientTransaction(
    @Query() params: ExpertTransactionFilterDto,
    @CurrentUser() user
  ): Promise<any> {
    const filter = params.filter && JSON.parse(params.filter);
    const sort = params.sort && JSON.parse(params.sort);
    const range = params.range && JSON.parse(params.range);
    const { data, total } = await this.paymentsService.clientTransaction(filter, sort, range, user);
    return {
      statusCode: 200,
      message: `Fetched all client transactions`,
      data,
      total,
    };
  }

  @ApiOperation({
    tags: ['Payment'],
    summary: 'List all Safeshare admin payout transactions',
    description: 'API to List all Safeshare admin payout transactions',
  })
  @ApiOkResponse({ type: ListPlatformPayoutResBaseDto })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('admin-payout')
  async listPlatformPayout(@Query() params: PlatformPayoutTransactionFilterDto): Promise<any> {
    const filter = params.filter && JSON.parse(params.filter);
    const sort = params.sort && JSON.parse(params.sort);
    const range = params.range && JSON.parse(params.range);
    const { data, total } = await this.paymentsService.listPlatformPayout(filter, sort, range);
    return {
      statusCode: 200,
      message: `Fetched all transactions`,
      data,
      total,
    };
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
  @ApiOperation({
    tags: ['Payment'],
    summary: 'Approve project updated milestone(s)',
    description: 'API to approve project milestone(s)',
  })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('/:project_id/:expert_id/approve-updated-milestone')
  async approveUpdatedMilestone(
    @Param('project_id') project_id: string,
    @Param('expert_id') expert_id: string,
    @CurrentUser() user
  ): Promise<any> {
    await this.paymentsService.approveUpdatedMilestone(project_id, expert_id, user);
    return {
      statusCode: 200,
      message: 'Milestone approved successfully!',
    };
  }
}
