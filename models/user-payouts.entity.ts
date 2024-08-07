import { Users } from '@app/authentication/models/users.entity';
import { Project } from '@core/project/models/project.entity';
import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
@Entity({ name: 'user_payouts' })
export class UserPayouts {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @JoinColumn({ name: 'project_id' })
  @ManyToOne(() => Project, (project: Project) => project.id)
  project: Project;

  @JoinColumn({ name: 'user_id' })
  @ManyToOne(() => Users, user => user.id, { nullable: true })
  user: Users;

  @Column({ type: 'numeric', precision: 38, scale: 2, nullable: true })
  payout_amount: number;

  @Column({ type: 'date', nullable: true })
  payout_date: Date;

  @Column({ type: 'varchar', default: 'pending', nullable: true })
  payout_status: string;

  @CreateDateColumn({
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
    nullable: false,
  })
  created_at: Date;

  @ApiProperty()
  @Column({ nullable: true })
  created_by: string;

  @UpdateDateColumn({
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
    nullable: false,
  })
  updated_at: Date;

  @Column({ type: 'varchar', nullable: true })
  reason: string;
}
