import { Controller, Post, Body, Get, Param } from '@nestjs/common';
import { InterviewService } from './interview.service';
import { InterviewConfig } from '../openai/gemini.service';

export interface StartInterviewDto {
  candidateName: string;
  jobTitle: string;
  difficulty: 'junior' | 'mid' | 'senior';
  questionTypes: string[];
  companyName?: string;
}

export interface SubmitAnswerDto {
  interviewId: string;
  answer: string;
  questionId: string;
}

@Controller('interview')
export class InterviewController {
  constructor(private readonly interviewService: InterviewService) {}

  @Post('start')
  async startInterview(@Body() config: StartInterviewDto) {
    return await this.interviewService.startInterview(config);
  }

  @Post('answer')
  async submitAnswer(@Body() submitAnswerDto: SubmitAnswerDto) {
    return await this.interviewService.submitAnswer(
      submitAnswerDto.interviewId,
      submitAnswerDto.answer,
      submitAnswerDto.questionId
    );
  }

  @Get(':id/next-question')
  async getNextQuestion(@Param('id') interviewId: string) {
    return await this.interviewService.getNextQuestion(interviewId);
  }

  @Get(':id/transcript')
  async getTranscript(@Param('id') interviewId: string) {
    return await this.interviewService.getTranscript(interviewId);
  }

  @Post(':id/end')
  async endInterview(@Param('id') interviewId: string) {
    return await this.interviewService.endInterview(interviewId);
  }
}