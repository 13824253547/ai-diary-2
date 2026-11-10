import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { CommonServicesModule } from '../../common/common-services.module';
import { PhotosModule } from '../photos/photos.module';
import { AccountAuthGuard } from './account-auth.guard';
import { AccountAuthService } from './account-auth.service';
import { AuthController } from './auth.controller';
import { EmailVerificationMailer } from './email-verification-mailer';

@Module({
  imports: [CommonServicesModule, PhotosModule],
  controllers: [AuthController],
  providers: [
    AccountAuthService,
    AccountAuthGuard,
    EmailVerificationMailer,
    { provide: APP_GUARD, useExisting: AccountAuthGuard },
  ],
  exports: [AccountAuthService],
})
export class AuthModule {}
