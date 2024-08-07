import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsDefined, IsNumber, IsString, IsUUID, ValidateNested } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { AdminFilterDto } from 'interfaces/filter.dto';
export class CardDto {
  @ApiProperty({
    required: false,
    description: 'payment method id',
  })
  @IsString()
  public cardId: string;
}
export class CreatePaymentDto {
  @ApiProperty({ required: true })
  @IsString()
  project_id: string;

  @ApiProperty({ required: true })
  @IsString()
  expert_id: string;

  @ApiProperty({ required: true })
  @IsString()
  card_id: string;

  @ApiProperty({ required: false })
  @IsString()
  return_url: string;
}
export class StripeAddress {
  @ApiProperty({ required: false })
  @IsString()
  city: string;

  @ApiProperty({ required: false })
  @IsString()
  line1: string;

  @ApiProperty({ required: false })
  @IsString()
  line2: string;
  @ApiProperty({ required: false })
  @IsString()
  postal_code: string;
  @ApiProperty({ required: false })
  @IsString()
  state: string;
}
export class StripeDOB {
  @ApiProperty({ required: false })
  @IsString()
  day: string;

  @ApiProperty({ required: false })
  @IsString()
  month: string;
  @ApiProperty({ required: false })
  @IsNumber()
  year: number;
}
export class DeleteConnectDto {
  @ApiProperty({ required: true })
  @IsString()
  connect_id: string;
}

export class BankId {
  @ApiProperty({ required: true })
  @IsString()
  id: string;
}

export class BankAccountDTO {
  @ApiProperty({ required: false })
  @IsString()
  account_number: string;
  @ApiProperty({ required: false })
  @IsString()
  routing_number: string;
  @ApiProperty({ required: false })
  @IsString()
  account_holder_name: string;
  @ApiProperty({ required: false })
  @IsString()
  country: string;
}
export class PrimaryBankAccountDTO {
  @ApiProperty({ required: true })
  @IsString()
  external_account: string;
}
export class CreateConnectAccountDTO {
  @ApiProperty({ required: false })
  @IsString()
  country: string;

  @ApiProperty({ required: false })
  @IsString()
  first_name: string;

  @ApiProperty({ required: false })
  @IsString()
  last_name: string;

  @ApiProperty({ required: false })
  @IsString()
  email: string;

  @ApiProperty({ type: StripeDOB })
  @Type(() => StripeDOB)
  @ValidateNested()
  dob: StripeDOB;

  @ApiProperty({ required: false })
  @IsString()
  return_url: string;

  @ApiProperty({ required: false })
  @IsString()
  refresh_url: string;
}

export class EditConnectAccountDTO {
  @ApiProperty({ required: false })
  @IsString()
  ssn_number: string;

  @ApiProperty({ required: true })
  @IsString()
  first_name: string;

  @ApiProperty({ required: true })
  @IsString()
  last_name: string;

  @ApiProperty({ required: true })
  @IsString()
  email: string;

  @ApiProperty({ required: true })
  @IsString()
  phone_number: string;

  @ApiProperty({ required: false })
  @IsString()
  url: string;

  @ApiProperty({ type: StripeAddress })
  @Type(() => StripeAddress)
  @ValidateNested()
  address: StripeAddress;

  @ApiProperty({ type: StripeDOB })
  @Type(() => StripeDOB)
  @ValidateNested()
  dob: StripeDOB;
}
export class DeleteBankAccountDto {
  @ApiProperty({ required: true })
  @IsString()
  delete: string;
}
export class UserCardDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  @IsString()
  card_id: string;

  @ApiProperty()
  @IsUUID()
  user_id: string;

  @ApiProperty()
  @IsString()
  brand: string;

  @ApiProperty()
  @IsString()
  last4: string;

  @ApiProperty()
  @IsNumber()
  exp_month: number;

  @ApiProperty()
  @IsNumber()
  exp_year: number;

  @ApiProperty()
  @IsBoolean()
  set_primary: boolean;
}

export class ExpertTransactionFilterDto extends AdminFilterDto {
  @ApiProperty({
    description: `
    Filter params pass the data as key value pair
    eg:
    {
      "created_at_gte":"2022-12-31T18:30:00.000Z",
      "created_at_lte":"2022-01-31T18:30:00.000Z",
      "status": <status_number>,
    }
  `,

    required: false,
    default: '{}',
  })
  @IsString()
  public filter: string;
}

export class PlatformPayoutTransactionFilterDto extends AdminFilterDto {
  @ApiProperty({
    description: `
    Filter params pass the data as key value pair
    eg:
    {
      "created_at_gte":"2022-12-31T18:30:00.000Z",
      "created_at_lte":"2022-01-31T18:30:00.000Z",
      "payout_status": < paid, pending, failed >,
    }
  `,

    required: false,
    default: '{}',
  })
  @IsString()
  public filter: string;
}

class User_idResDto {
  @ApiProperty()
  id: string;
  @ApiProperty()
  first_name: string;
}
class Project_idResDto {
  @ApiProperty()
  id: string;
  @ApiProperty()
  title: string;
}
class DataResDto {
  @ApiProperty()
  id: string;
  @ApiProperty()
  created_at: string;
  @ApiProperty()
  transaction_id: string;
  @ApiProperty()
  currency: string;
  @ApiProperty()
  payout_amount: string;
  @ApiProperty()
  consultant_amount: string;
  @ApiProperty()
  platform_fees: string;
  @ApiProperty()
  processing_fees: string;
  @ApiProperty()
  payment_method: string;
  @ApiProperty()
  status: number;
  @ApiProperty()
  transaction_type: number;
  @ApiProperty({ type: User_idResDto })
  user_id: User_idResDto;
  @ApiProperty({ type: Project_idResDto })
  project_id: Project_idResDto;
}
export class ExpertTransactionResBaseDto {
  @ApiProperty()
  statusCode: number;
  @ApiProperty()
  message: string;
  @ApiProperty({ type: [DataResDto] })
  data: DataResDto[];
  @ApiProperty()
  total: number;
}

class ListPlatformPayoutResDataDto {
  @ApiProperty()
  id: string;
  @ApiProperty()
  created_at: string;
  @ApiProperty()
  payout_status: string;
  @ApiProperty()
  transferred_amount: string;
  @ApiProperty()
  transaction_id: string;
}
export class ListPlatformPayoutResBaseDto {
  @ApiProperty()
  statusCode: number;
  @ApiProperty()
  message: string;
  @ApiProperty({ type: [ListPlatformPayoutResDataDto] })
  data: ListPlatformPayoutResDataDto[];
  @ApiProperty()
  total: number;
}

export class CardListResponse {
  @ApiProperty({ description: 'Status Code of the response', type: 'number' })
  statusCode: number;

  @ApiProperty({ description: 'Message of the response', type: 'string' })
  message: string;

  @ApiProperty({ description: 'Data list needed in the response', type: 'array' })
  data: object[];
}
export class CardResponseDto {
  @ApiProperty({ description: 'Status code of the response', type: 'number' })
  statusCode: number;

  @ApiProperty({ description: 'Message of the response', type: 'string' })
  message: string;

  @ApiProperty({ description: 'Data needed in the response', type: 'object' })
  data: object;
}
export class AddCardDto {
  @ApiProperty({ type: 'string', description: 'Id of the card to be deleted' })
  @IsDefined()
  @IsString()
  cardId: string;
}

interface Milestone {
  id: string;
  // other properties
}
