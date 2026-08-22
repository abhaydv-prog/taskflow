import { Request, Response } from 'express';
import { getJobStatus } from '../services/jobService';

export async function getJobHandler(req: Request, res: Response) {
  const status = await getJobStatus(req.params.id);
  res.json(status);
}