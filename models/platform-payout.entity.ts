import { Users } from '@app/authentication/models/users.entity';
import { ApiProperty } from '@nestjs/swagger';
import { IsNumber } from 'class-validator';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity({ name: 'platform_payouts' })
export class PlatformPayout {
  @ApiProperty({ readOnly: true, type: 'string' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @CreateDateColumn({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  created_at: Date;

  @Column({ type: 'varchar', default: 'pending', nullable: true })
  payout_status: string;

  @Column({ type: 'numeric', precision: 38, scale: 2, nullable: true })
  transferred_amount: number;

  @Column({ nullable: true })
  transaction_id: string;
}
