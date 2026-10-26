import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AppAttestVerifier } from './app-attest-verifier';
import { IdentityAuthGuard } from './identity-auth.guard';
import { IdentityAuthService } from './identity-auth.service';
import { IdentityController } from './identity.controller';

@Module({
  controllers: [IdentityController],
  providers: [
    AppAttestVerifier,
    IdentityAuthService,
    IdentityAuthGuard,
    {
      provide: APP_GUARD,
      useExisting: IdentityAuthGuard,
    },
  ],
})
export class IdentityModule {}
