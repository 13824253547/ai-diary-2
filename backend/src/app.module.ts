import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CommonServicesModule } from './common/common-services.module';
import { HealthController } from './common/health.controller';
import { DiariesModule } from './modules/diaries/diaries.module';
import { DraftsModule } from './modules/drafts/drafts.module';
import { GenerationModule } from './modules/generation/generation.module';
import { IdentityModule } from './modules/identity/identity.module';
import { MemoriesModule } from './modules/memories/memories.module';
import { PhotosModule } from './modules/photos/photos.module';
import { SharingModule } from './modules/sharing/sharing.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    CommonServicesModule,
    IdentityModule,
    PhotosModule,
    DraftsModule,
    GenerationModule,
    DiariesModule,
    MemoriesModule,
    SharingModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
