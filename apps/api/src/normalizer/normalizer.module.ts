import { Module } from '@nestjs/common';
import { ClassifierModule } from '../classifier/classifier.module';
import { FxService } from './fx.service';
import { NormalizerService } from './normalizer.service';

@Module({
  imports: [ClassifierModule],
  providers: [NormalizerService, FxService],
  exports: [NormalizerService, FxService],
})
export class NormalizerModule {}
