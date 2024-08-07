import { Users } from '@app/authentication/models/users.entity';
import { BaseEntity } from '@interface';
import { Column, Entity, JoinColumn, ManyToOne, OneToMany, OneToOne } from 'typeorm';

@Entity({ name: 'user_connects' })
export class UserConnects extends BaseEntity {
  @Column({ type: 'varchar', length: 50, nullable: true })
  connect_id: string;

  @Column({ type: 'varchar', nullable: true })
  first_name: string;

  @Column({ type: 'varchar', nullable: true })
  last_name: string;

  @Column({ type: 'varchar', nullable: true })
  email: string;

  @Column({ type: 'varchar', nullable: true })
  ssn_last4: string;

  @Column({ type: 'varchar', nullable: true })
  phone_number: string;

  @Column({ type: 'varchar', nullable: true })
  address: string;

  @Column({ type: 'varchar', nullable: true })
  address_two: string;

  @Column({ type: 'varchar', nullable: true })
  city: string;

  @Column({ type: 'varchar', nullable: true })
  state: string;

  @Column({ type: 'varchar', nullable: true })
  postal_code: string;

  @Column({ type: 'varchar', nullable: true })
  country: string;

  @Column({ type: 'varchar', nullable: true })
  DOB: string;

  @Column({ type: 'varchar', nullable: true })
  profle_url: string;

  @Column({
    type: 'varchar',
    default: 'Pending',
  })
  verification_status: string;

  @Column({ type: 'varchar', nullable: true })
  reason: string;
}
