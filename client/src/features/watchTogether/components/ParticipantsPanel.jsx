import { Crown, UsersRound } from "lucide-react";

const initials = (name) => String(name || "Movie fan")
  .split(" ")
  .filter(Boolean)
  .slice(0, 2)
  .map((part) => part[0])
  .join("")
  .toUpperCase();

const Avatar = ({ participant }) => participant.image ? (
  <img src={participant.image} alt="" className="w-8 h-8 rounded-full object-cover border border-white/10" />
) : (
  <span className="w-8 h-8 shrink-0 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center border border-primary/30">
    {initials(participant.name)}
  </span>
);

const ParticipantsPanel = ({ participants, currentUserId }) => {
  return (
    <section className="border border-white/10 bg-white/[0.025] rounded-lg overflow-hidden">
      <div className="h-12 px-4 flex items-center justify-between border-b border-white/10">
        <span className="flex items-center gap-2 text-sm font-medium"><UsersRound className="w-4 h-4 text-primary" /> People</span>
        <span className="text-xs text-gray-400">{participants.length}</span>
      </div>
      <div className="max-h-58 overflow-y-auto divide-y divide-white/8">
        {participants.length ? participants.map((participant) => {
          const isCurrentUser = participant.userId === currentUserId;
          return (
            <div key={participant.socketId || participant.userId} className="min-h-14 px-4 py-2 flex items-center gap-3">
              <Avatar participant={participant} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{isCurrentUser ? "You" : participant.name}</span>
                <span className="block text-xs text-gray-500 mt-0.5">
                  {participant.isHost ? "Room creator" : "Watching"}
                </span>
              </span>
              {participant.isHost && <Crown className="w-4 h-4 text-amber-300" title="Room creator" />}
            </div>
          );
        }) : <p className="py-6 text-center text-sm text-gray-500">Connecting to the room...</p>}
      </div>
    </section>
  );
};

export default ParticipantsPanel;
