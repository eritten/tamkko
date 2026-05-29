import { Response } from 'express';
import { AuthRequest } from '@/middleware/auth';
import { catchAsync } from '@/utils/catchAsync';
import * as vipService from '@/services/vip.service';

const actorId = (req: AuthRequest) => req.user?.id ?? '';

export const generateCampusCode = catchAsync(async (req: AuthRequest, res: Response) => {
  const data = await vipService.createCampusCode(req.body);
  res.status(201).json({ status: 'success', data });
});

export const listCampusCodes = catchAsync(async (_req: AuthRequest, res: Response) => {
  const data = await vipService.listCampusCodes();
  res.json({ status: 'success', data });
});

export const createRoom = catchAsync(async (req: AuthRequest, res: Response) => {
  const data = await vipService.createRoom(actorId(req), req.body);
  res.status(201).json({ status: 'success', data });
});

export const listRooms = catchAsync(async (req: AuthRequest, res: Response) => {
  const data = await vipService.listRooms(req.query);
  res.json({ status: 'success', data });
});

export const getRoom = catchAsync(async (req: AuthRequest, res: Response) => {
  const data = await vipService.getRoom(req.params.roomId);
  res.json({ status: 'success', data });
});

export const updateRoom = catchAsync(async (req: AuthRequest, res: Response) => {
  const data = await vipService.updateRoom(req.params.roomId, actorId(req), req.body);
  res.json({ status: 'success', data });
});

export const deleteRoom = catchAsync(async (req: AuthRequest, res: Response) => {
  const data = await vipService.deleteRoom(req.params.roomId, actorId(req));
  res.json({ status: 'success', data });
});

export const joinRoom = catchAsync(async (req: AuthRequest, res: Response) => {
  const data = await vipService.joinRoom(req.params.roomId, actorId(req), req.body);
  res.status(201).json({ status: 'success', data });
});

export const leaveRoom = catchAsync(async (req: AuthRequest, res: Response) => {
  const data = await vipService.leaveRoom(req.params.roomId, actorId(req));
  res.json({ status: 'success', data });
});

export const getRoomMembers = catchAsync(async (req: AuthRequest, res: Response) => {
  const data = await vipService.getRoomMembers(req.params.roomId, req.query);
  res.json({ status: 'success', data });
});

export const kickMember = catchAsync(async (req: AuthRequest, res: Response) => {
  const targetUserId = req.params.userId || req.body.userId;
  const data = await vipService.kickMember(req.params.roomId, actorId(req), targetUserId, req.user!.role);
  res.json({ status: 'success', data });
});

export const banMember = catchAsync(async (req: AuthRequest, res: Response) => {
  const targetUserId = req.params.userId || req.body.userId;
  const data = await vipService.banMember(req.params.roomId, actorId(req), targetUserId, req.user!.role);
  res.json({ status: 'success', data });
});

export const createPost = catchAsync(async (req: AuthRequest, res: Response) => {
  const data = await vipService.createPost(req.params.roomId, actorId(req), req.body);
  res.status(201).json({ status: 'success', data });
});

export const getRoomPosts = catchAsync(async (req: AuthRequest, res: Response) => {
  const data = await vipService.getRoomPosts(
    req.params.roomId,
    actorId(req),
    Number(req.query.page || 1),
    Number(req.query.limit || 20)
  );
  res.json({ status: 'success', data });
});

export const deletePost = catchAsync(async (req: AuthRequest, res: Response) => {
  const data = await vipService.deletePost(req.params.postId, actorId(req), req.user!.role);
  res.json({ status: 'success', data });
});

export const processPayment = catchAsync(async (req: AuthRequest, res: Response) => {
  const data = await vipService.processPayment(req.params.roomId, actorId(req), req.body);
  res.json({ status: 'success', data });
});

export const handlePaymentWebhook = catchAsync(async (req: AuthRequest, res: Response) => {
  res.json({ status: 'success', data: { received: true, provider: 'hubtel', payload: req.body } });
});

export const getRoomRevenue = catchAsync(async (req: AuthRequest, res: Response) => {
  const data = await vipService.getRoomRevenue(req.params.roomId);
  res.json({ status: 'success', data });
});

export const getRoomsByCampus = catchAsync(async (req, res: Response) => {
  const data = await vipService.getRoomsByCampus(req.params.campusCode);
  res.json({ status: 'success', data });
});
