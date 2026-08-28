import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { JobsModule } from '../jobs/jobs.module';
import { NormalizerModule } from '../normalizer/normalizer.module';
import { ScraperModule } from '../scraper/scraper.module';
import { SchedulerService } from './scheduler.service';

@Module({
  imports: [ScheduleModule.forRoot(), ScraperModule, JobsModule, NormalizerModule],
  providers: [SchedulerService],
  exports: [SchedulerService],
})
export class SchedulerModule {}
