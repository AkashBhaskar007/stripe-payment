import { Users } from '@app/authentication/models/users.entity';
import { BaseEntity } from '@interface';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

@Entity({ name: 'bank_account' })
export class BankAccounts extends BaseEntity {
  @Column({ type: 'varchar', nullable: true })
  stripe_bank_id: string;

  @Column({ type: 'varchar', nullable: true })
  account_holder_name: string;

  @Column({ type: 'varchar', nullable: true })
  account_number_last4: string;

  @Column({ type: 'varchar', nullable: true })
  routing_number: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  connect_id: string;

  @Column({ type: 'boolean', nullable: true })
  is_primary: boolean;

  @Column({ type: 'varchar', length: 50, nullable: true })
  bank_status: string;

  @Column({ type: 'varchar', nullable: true })
  country: string;

  @Column({ type: 'varchar', nullable: true })
  reason: string;

  @Column({ nullable: true, default: 1 })
  status: number;
}
