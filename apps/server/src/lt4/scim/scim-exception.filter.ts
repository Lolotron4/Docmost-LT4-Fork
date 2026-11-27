// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// Antwortet bei Fehlern unter /api/scim/v2 im SCIM-Fehlerformat.
import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { FastifyReply } from 'fastify';
import { SCIM_CONTENT_TYPE, SCIM_ERROR, ScimError } from './scim.constants';
import { ScimFilterError } from './scim-filter';

@Catch()
export class ScimExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('Lt4Scim');

  catch(exception: unknown, host: ArgumentsHost) {
    const reply = host.switchToHttp().getResponse<FastifyReply>();
    let status = 500;
    let detail = 'Internal server error';
    let scimType: string | undefined;

    if (exception instanceof ScimError) {
      status = exception.getStatus();
      detail = exception.message;
      scimType = exception.scimType;
    } else if (exception instanceof ScimFilterError) {
      status = 400;
      detail = exception.message;
      scimType = 'invalidFilter';
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res: any = exception.getResponse();
      const msg = typeof res === 'string' ? res : res?.message ?? exception.message;
      detail = Array.isArray(msg) ? msg.join(', ') : String(msg);
    } else {
      this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    }

    reply
      .status(status)
      .header('Content-Type', SCIM_CONTENT_TYPE)
      .send({
        schemas: [SCIM_ERROR],
        status: String(status),
        ...(scimType ? { scimType } : {}),
        detail,
      });
  }
}
