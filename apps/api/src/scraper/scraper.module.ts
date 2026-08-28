import { Module } from '@nestjs/common';
import { ClassifierModule } from '../classifier/classifier.module';
import { NormalizerModule } from '../normalizer/normalizer.module';
import { JobsModule } from '../jobs/jobs.module';
import { BrowserPool } from './lib/browser-pool';
import { ScraperController } from './scraper.controller';
import { ScraperRegistry } from './scraper.registry';
import { ScraperService } from './scraper.service';

@Module({
  imports: [ClassifierModule, NormalizerModule, JobsModule],
  controllers: [ScraperController],
  providers: [ScraperService, ScraperRegistry, BrowserPool],
  exports: [ScraperService],
})
export class ScraperModule {}
