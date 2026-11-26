// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import { Module } from '@nestjs/common';
import { ShareGuardService } from './share-guard.service';
import {
  ShareGuardController,
  ShareGuardPublicController,
} from './share-guard.controller';

@Module({
  controllers: [ShareGuardController, ShareGuardPublicController],
  providers: [ShareGuardService],
  exports: [ShareGuardService],
})
export class Lt4ShareGuardModule {}
