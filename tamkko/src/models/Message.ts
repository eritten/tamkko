import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IMessageDoc extends Document {
  sender: Types.ObjectId;
  recipient?: Types.ObjectId;
  room?: Types.ObjectId;
  messageType: 'direct' | 'vip_room';
  content: string;
  mediaUrl?: string;
  mediaType?: 'image' | 'video' | 'audio';
  isRead: boolean;
  isEdited: boolean;
  editedAt?: Date;
  isDeleted: boolean;
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const messageSchema = new Schema<IMessageDoc>(
  {
    sender: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    recipient: { type: Schema.Types.ObjectId, ref: 'User' },
    room: { type: Schema.Types.ObjectId, ref: 'VIPRoom' },
    messageType: { type: String, enum: ['direct', 'vip_room'], required: true },
    content: { type: String, required: true, trim: true, maxlength: 1000 },
    mediaUrl: { type: String },
    mediaType: { type: String, enum: ['image', 'video', 'audio'] },
    isRead: { type: Boolean, default: false },
    isEdited: { type: Boolean, default: false },
    editedAt: { type: Date },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date },
  },
  { timestamps: true }
);

messageSchema.index({ sender: 1, recipient: 1, createdAt: -1 });
messageSchema.index({ recipient: 1, isRead: 1 });
messageSchema.index({ room: 1, createdAt: -1 });

export const Message = mongoose.model<IMessageDoc>('Message', messageSchema);
export default Message;
