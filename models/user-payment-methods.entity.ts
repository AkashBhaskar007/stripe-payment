import { Users } from '@app/authentication/models/users.entity';
import { BaseEntity } from '@interface';
import { ProjectStatus } from 'enums/project.enum';
import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { UserCardDetails } from './user-card-details.entity';

@Entity({ name: 'user_payment_methods' })
export class UserPaymentMethods extends BaseEntity {
  @JoinColumn({ name: 'user_id' })
  @ManyToOne(() => Users, user => user.id)
  user: Users;

  @JoinColumn({ name: 'user_card_detail_id' })
  @ManyToOne(() => UserCardDetails, card => card.id)
  card: Users;
}
