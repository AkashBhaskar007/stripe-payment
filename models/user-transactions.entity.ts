import { Users } from '@app/authentication/models/users.entity';
import { BaseEntity } from '@interface';
import { ProjectStatus } from 'enums/project.enum';
import { Column, Entity, JoinColumn, ManyToOne, OneToMany, OneToOne } from 'typeorm';
import { UserInvoices } from './user-invoices.entity';
import { UserPaymentMethods } from './user-payment-methods.entity';
import { PaymentStatus } from 'enums/payment.enum';
import { Project } from '@core/project/models/project.entity';

@Entity({ name: 'user_transactions' })
export class UserTransactions extends BaseEntity {
  @Column({ nullable: true })
  transaction_id: string;

  @JoinColumn({ name: 'invoice_id' })
  @OneToOne(() => UserInvoices, invoice => invoice.id)
  invoice: UserInvoices;

  @Column({ nullable: true })
  currency: string;

  @Column({ type: 'numeric', precision: 38, scale: 2, nullable: true })
  amount: number;

  @Column({ type: 'numeric', precision: 38, scale: 2, nullable: true })
  platform_fees: number;

  @Column({ type: 'numeric', precision: 38, scale: 2, nullable: true })
  processing_fees: number;

  @Column({ nullable: true })
  payment_method: string;

  @Column({ type: 'integer', default: PaymentStatus.PENDING, nullable: true })
  status: number;

  @Column({ type: 'integer', nullable: true })
  transaction_type: number;

  @JoinColumn({ name: 'project_id' })
  @ManyToOne(() => Project, project_id => project_id.id)
  project_id: Project;

  @JoinColumn({ name: 'user_id' })
  @ManyToOne(() => Users, user_id => user_id.id)
  user_id: Users;
}
