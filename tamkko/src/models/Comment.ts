import mongoose, { Document, Schema, Types } from 'mongoose';

export interface ICommentDoc extends Document {
  author: Types.ObjectId;
  target: Types.ObjectId;
  targetModel: 'Video' | 'VIPPost';
  content: string;
  parentComment: Types.ObjectId | null;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const commentSchema = new Schema<ICommentDoc>(
  {
    author: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    target: { type: Schema.Types.ObjectId, required: true },
    targetModel: { type: String, enum: ['Video', 'VIPPost'], required: true },
    content: { type: String, required: true, trim: true, minlength: 1, maxlength: 500 },
    parentComment: { type: Schema.Types.ObjectId, ref: 'Comment', default: null },
    isDeleted: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

commentSchema.index({ target: 1, targetModel: 1, createdAt: -1 });
commentSchema.index({ parentComment: 1 });

export const Comment = mongoose.model<ICommentDoc>('Comment', commentSchema);
export default Comment;
