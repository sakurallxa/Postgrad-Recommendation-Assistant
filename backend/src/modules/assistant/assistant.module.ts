import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AssistantController } from './assistant.controller';
import { SubscriptionController } from './subscription.controller';
import { ProfileController } from './profile.controller';
import { LlmAssistantService } from './llm-assistant.service';
import { UrlFetcherService } from './url-fetcher.service';

@Module({
  imports: [ConfigModule],
  controllers: [AssistantController, SubscriptionController, ProfileController],
  providers: [LlmAssistantService, UrlFetcherService],
  exports: [LlmAssistantService, UrlFetcherService],
})
export class AssistantModule {}
