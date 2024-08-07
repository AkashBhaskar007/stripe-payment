import { Users } from '@app/authentication/models/users.entity';
import { Project } from '@core/project/models/project.entity';
import { ApiProperty } from '@nestjs/swagger';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
@Entity({ name: 'user_invoices' })
export class UserInvoices {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', nullable: true })
  invoice_id: string;

  @JoinColumn({ name: 'project_id' })
  @ManyToOne(() => Project, (project: Project) => project.id)
  project: Project;

  @JoinColumn({ name: 'user_id' })
  @ManyToOne(() => Users, user => user.id, { nullable: true })
  user: Users;

  @Column({ nullable: true })
  amount_without_fee: number;

  @Column({ nullable: true })
  amount_paid: number;

  @Column({ type: 'integer', nullable: true })
  status: number;

  @Column({ type: 'integer', nullable: true })
  invoice_type: number;

  @Column({ type: 'text', nullable: true })
  invoice_description: string;

  @Column({ type: 'date', nullable: true })
  invoice_paid_date: Date;

  @Column({ type: 'date', nullable: true })
  invoice_due_date: Date;

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
}
