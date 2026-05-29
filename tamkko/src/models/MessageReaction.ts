import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IMessageReactionDoc extends Document {
  message: Types.ObjectId;
  user: Types.ObjectId;
  emoji: string;
  createdAt: Date;
}

const messageReactionSchema = new Schema<IMessageReactionDoc>(
  {
    message: { type: Schema.Types.ObjectId, ref: 'Message', required: true, index: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    emoji: { type: String, required: true, trim: true, maxlength: 10 },
  },
  { timestamps: true }
);

messageReactionSchema.index({ message: 1, user: 1 }, { unique: true });

export const MessageReaction = mongoose.model<IMessageReactionDoc>('MessageReaction', messageReactionSchema);
export default MessageReaction;
