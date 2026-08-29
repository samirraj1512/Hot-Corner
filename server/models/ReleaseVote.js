import mongoose from "mongoose";

const releaseVoteSchema = new mongoose.Schema(
  {
    movieId: { type: String, required: true, unique: true },
    voters: { type: [String], default: [] },
  },
  { timestamps: true }
);

const ReleaseVote = mongoose.model("ReleaseVote", releaseVoteSchema);

export default ReleaseVote;
