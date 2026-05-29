import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IVIPPostDoc extends Document {
  room: Types.ObjectId;
  author: Types.ObjectId;
  content: string;
  mediaUrl?: string;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const vipPostSchema = new Schema<IVIPPostDoc>(
  {
    room: { type: Schema.Types.ObjectId, ref: 'VIPRoom', required: true, index: true },
    author: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    content: { type: String, required: true, trim: true, maxlength: 2000 },
    mediaUrl: { type: String, trim: true },
    isDeleted: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

vipPostSchema.index({ room: 1, createdAt: -1 });
vipPostSchema.index({ room: 1, isDeleted: 1 });

export const VIPPost = mongoose.model<IVIPPostDoc>('VIPPost', vipPostSchema);
export default VIPPost;
