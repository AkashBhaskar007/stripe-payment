import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  UpdateDateColumn,
  PrimaryGeneratedColumn,
  ManyToOne,
} from 'typeorm';
import { Project } from '@core/project/models/project.entity';
import { Users } from '@app/authentication/models/users.entity';
import { ProjectBillingStatus } from 'enums/project.enum';

@Entity({ name: 'project_billing' })
export class ProjectBilling {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @JoinColumn({ name: 'project_id' })
  @ManyToOne(() => Project, (project: Project) => project.id)
  project: Project;

  @Column({ type: 'varchar', nullable: true })
  payout_id: string;

  @JoinColumn({ name: 'expert_id' })
  @ManyToOne(() => Users, user => user.id)
  expert: Users;

  @JoinColumn({ name: 'client_id' })
  @ManyToOne(() => Users, user => user.id)
  client: Users;

  @Column({
    default: ProjectBillingStatus.PAYOUT_PENDING,
    comment: 'Possible values,  3',
    nullable: false,
  })
  status: number;

  @CreateDateColumn({
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
    nullable: false,
  })
  created_at: Date;

  @UpdateDateColumn({
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
    nullable: false,
  })
  updated_at: Date;

  @Column({ type: 'numeric', precision: 38, scale: 2, nullable: true })
  quoted_amount: number;

  @Column({ type: 'numeric', precision: 38, scale: 2, nullable: true })
  platform_fees: number;

  @Column({ type: 'numeric', precision: 38, scale: 2, nullable: true })
  processing_fees: number;

  @Column({ type: 'numeric', precision: 38, scale: 2, nullable: true })
  payout_completed: number;

  @Column({ default: false, nullable: true })
  is_payout_pending: boolean;

  @Column({ type: 'numeric', precision: 38, scale: 2, nullable: true })
  payout_pending: number;
}
