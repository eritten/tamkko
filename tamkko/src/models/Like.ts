import mongoose, { Document, Schema, Types } from 'mongoose';

export interface ILikeDoc extends Document {
  user: Types.ObjectId;
  target: Types.ObjectId;
  targetModel: 'Video' | 'VIPPost';
  type: 'like' | 'dislike';
  createdAt: Date;
}

const likeSchema = new Schema<ILikeDoc>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    target: { type: Schema.Types.ObjectId, required: true },
    targetModel: { type: String, enum: ['Video', 'VIPPost'], required: true },
    type: { type: String, enum: ['like', 'dislike'], required: true },
  },
  { timestamps: true }
);

likeSchema.index({ user: 1, target: 1, targetModel: 1 }, { unique: true });
likeSchema.index({ target: 1, targetModel: 1, type: 1 });

export const Like = mongoose.model<ILikeDoc>('Like', likeSchema);
export default Like;
