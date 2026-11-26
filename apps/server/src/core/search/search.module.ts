import { Module } from '@nestjs/common';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { PublicSpaceModule } from '../public-space/public-space.module';
import { ShareModule } from '../share/share.module';
import { Lt4ShareGuardModule } from '../../lt4/share-guard/share-guard.module';

@Module({
  imports: [PublicSpaceModule, ShareModule, Lt4ShareGuardModule],
  controllers: [SearchController],
  providers: [SearchService],
  exports: [SearchService],
})
export class SearchModule {}
