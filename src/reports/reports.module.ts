import { Module } from '@nestjs/common';

import { AttentionsModule } from '../attentions/attentions.module';
import { AuthModule } from '../auth/auth.module';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  imports: [AuthModule, AttentionsModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
