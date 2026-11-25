import mongoose from "mongoose";

const schema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    projectId: String,
    title: { type: String, default: "New conversation" },
    messages: [
      {
        role: { type: String, enum: ["user", "assistant"] },
        content: String,
        sources: Array,
        createdAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

export default mongoose.model("Chat", schema);
