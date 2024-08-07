import { Users } from '@app/authentication/models/users.entity';
import { BaseEntity } from '@interface';
import { Column, Entity, JoinColumn, ManyToOne, OneToMany, OneToOne } from 'typeorm';

@Entity({ name: 'user_card_details' })
export class UserCardDetails extends BaseEntity {
  @JoinColumn({ name: 'user_id' })
  @ManyToOne(() => Users, user => user.id)
  user: Users;

  @Column({ type: 'varchar', nullable: true })
  card_id: string;

  @Column({ type: 'varchar', nullable: true })
  brand: string;

  @Column({ type: 'varchar', nullable: true })
  last4: string;

  @Column({ type: 'varchar', nullable: true })
  card_country: string;

  @Column({ type: 'integer', nullable: true })
  exp_month: number;

  @Column({ type: 'integer', nullable: true })
  exp_year: number;

  @Column({ nullable: false, default: true })
  set_primary: boolean;
}
