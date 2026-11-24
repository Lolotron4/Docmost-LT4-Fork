// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import { Module } from '@nestjs/common';
import { McpController } from './mcp.controller';
import { McpToolsService } from './mcp-tools.service';

@Module({
  controllers: [McpController],
  providers: [McpToolsService],
})
export class Lt4McpModule {}
