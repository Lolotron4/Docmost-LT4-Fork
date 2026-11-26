import { Module } from '@nestjs/common';
import { ShareController } from './share.controller';
import { ShareService } from './share.service';
import { TokenModule } from '../auth/token.module';
import { ShareSeoController } from './share-seo.controller';
import { TransclusionModule } from '../page/transclusion/transclusion.module';
import { Lt4ShareGuardModule } from '../../lt4/share-guard/share-guard.module';

@Module({
  imports: [TokenModule, TransclusionModule, Lt4ShareGuardModule],
  controllers: [ShareController, ShareSeoController],
  providers: [ShareService],
  exports: [ShareService],
})
export class ShareModule {}
