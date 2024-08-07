import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProjectMilestone } from '@core/project/models/project-milestones.entity';
import { Project } from '@core/project/models/project.entity';
import { ProjectBilling } from './models/project-billing.entity';
import { ProjectModule } from '@core/project';
import { Users } from '@app/authentication/models/users.entity';
import { UserCardDetails } from './models/user-card-details.entity';
import { StripeService } from './stripe.service';
import { NotificationsModule } from '@app/notifications';
import { EmailsModule } from '@app/emails';
import { UserConnects } from './models/user-connects.entity';
import { BankAccounts } from './models/external_accounts.entity';
import { Notifications } from '@app/notifications/model/notification.entity';
import { UserTransactions } from './models/user-transactions.entity';
import { UserPayouts } from './models/user-payouts.entity';
import { PlatformPayout } from './models/platform-payout.entity';
import { ProjectExpert } from '@core/project/models/project-experts.entity';

@Module({
  providers: [PaymentsService, StripeService],
  exports: [PaymentsService],
  controllers: [PaymentsController],
  imports: [
    ProjectModule,
    NotificationsModule,
    EmailsModule,
    TypeOrmModule.forFeature([
      ProjectMilestone,
      Project,
      ProjectBilling,
      ProjectExpert,
      Users,
      UserCardDetails,
      UserConnects,
      BankAccounts,
      Notifications,
      UserTransactions,
      UserPayouts,
      PlatformPayout,
    ]),
  ],
})
export class PaymentsModule {}
