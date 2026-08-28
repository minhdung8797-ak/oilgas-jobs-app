import { Module } from '@nestjs/common';
import { ClassifierController } from './classifier.controller';
import { ClassifierService } from './classifier.service';
import { HuggingFaceService } from './huggingface.service';
import { ReclassifyService } from './reclassify.service';

@Module({
  controllers: [ClassifierController],
  providers: [ClassifierService, HuggingFaceService, ReclassifyService],
  exports: [ClassifierService],
})
export class ClassifierModule {}
