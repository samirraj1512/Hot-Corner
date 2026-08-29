import { createElement, useCallback, useEffect, useState } from "react";
import {
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Eye,
  Radio,
  RefreshCw,
  Search,
  UsersRound,
  X,
} from "lucide-react";
import toast from "react-hot-toast";
import Loading from "../../components/Loading";
import Title from "../../components/admin/Title";
import { useAppContext } from "../../context/AppContextCore";

const RANGE_OPTIONS = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "all", label: "All time" },
];

const EMPTY_SUMMARY = {
  roomsCreated: 0,
  viewingSessions: 0,
  uniqueViewers: 0,
  totalWatchSeconds: 0,
  activeRooms: 0,
};

const formatDateTime = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

const formatDuration = (value = 0) => {
  const seconds = Math.max(0, Math.floor(Number(value) || 0));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  if (hours) return `${hours}h ${minutes}m`;
  if (minutes) return `${minutes}m ${remainingSeconds}s`;
  return `${remainingSeconds}s`;
};

const Stat = ({ icon, label, value }) => (
  <div className="min-w-42 flex-1 border border-primary/30 bg-primary/10 px-4 py-3 rounded-md">
    <div className="flex items-center justify-between gap-3 text-sm text-gray-300">
      <span>{label}</span>
      {createElement(icon, { className: "w-4 h-4 text-primary" })}
    </div>
    <p className="mt-2 text-xl font-medium">{value}</p>
  </div>
);

const SessionStatus = ({ status }) => {
  const statusStyles = {
    watching: "bg-emerald-400/15 text-emerald-200 border-emerald-300/25",
    left: "bg-white/5 text-gray-300 border-white/10",
    disconnected: "bg-amber-300/10 text-amber-100 border-amber-300/25",
  };
  const labels = {
    watching: "Watching now",
    left: "Left room",
    disconnected: "Connection ended",
  };

  return (
    <span className={`inline-flex border px-2 py-1 text-xs rounded-md ${statusStyles[status] || statusStyles.left}`}>
      {labels[status] || labels.left}
    </span>
  );
};

const WatchTogether = () => {
  const { axios, getToken, user } = useAppContext();
  const [range, setRange] = useState("30d");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [searchVersion, setSearchVersion] = useState(0);
  const [data, setData] = useState({ summary: EMPTY_SUMMARY, rooms: [], pagination: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const authorization = useCallback(async () => ({
    headers: { Authorization: `Bearer ${await getToken()}` },
  }), [getToken]);

  const loadOverview = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const config = await authorization();
      const { data: response } = await axios.get("/api/admin/watch-together", {
        ...config,
        params: { range, search, page, limit: 25 },
      });
      if (!response.success) throw new Error(response.message || "Could not load Watch Together activity.");
      setData({
        summary: { ...EMPTY_SUMMARY, ...response.summary },
        rooms: response.rooms || [],
        pagination: response.pagination,
      });
    } catch (requestError) {
      console.error(requestError);
      setError(requestError.response?.data?.message || requestError.message || "Could not load Watch Together activity.");
      setData({ summary: EMPTY_SUMMARY, rooms: [], pagination: null });
    } finally {
      setLoading(false);
    }
  }, [authorization, axios, page, range, search]);

  const loadRoomDetail = useCallback(async (room) => {
    try {
      setSelectedRoom(room);
      setDetail(null);
      setDetailLoading(true);
      const config = await authorization();
      const { data: response } = await axios.get(`/api/admin/watch-together/rooms/${room.id}`, config);
      if (!response.success) throw new Error(response.message || "Could not load this room activity.");
      setDetail(response);
    } catch (requestError) {
      console.error(requestError);
      toast.error(requestError.response?.data?.message || requestError.message || "Could not load this room activity.");
      setSelectedRoom(null);
    } finally {
      setDetailLoading(false);
    }
  }, [authorization, axios]);

  useEffect(() => {
    if (user) loadOverview();
  }, [loadOverview, searchVersion, user]);

  const submitSearch = (event) => {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
    setSearchVersion((current) => current + 1);
  };

  const changeRange = (event) => {
    setRange(event.target.value);
    setPage(1);
  };

  const pagination = data.pagination;

  if (loading && !data.pagination) return <Loading />;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Title text1="Watch" text2=" Together" />
        <button
          type="button"
          onClick={loadOverview}
          title="Refresh room activity"
          aria-label="Refresh room activity"
          className="w-10 h-10 flex items-center justify-center border border-white/15 hover:border-primary hover:bg-primary/10 rounded-md transition cursor-pointer"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="mt-6 grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Stat icon={Radio} label="Rooms created" value={data.summary.roomsCreated} />
        <Stat icon={UsersRound} label="Viewing sessions" value={data.summary.viewingSessions} />
        <Stat icon={Eye} label="Unique viewers" value={data.summary.uniqueViewers} />
        <Stat icon={Clock3} label="Room presence" value={formatDuration(data.summary.totalWatchSeconds)} />
        <Stat icon={CalendarClock} label="Live rooms" value={data.summary.activeRooms} />
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-y border-white/10 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <label className="sr-only" htmlFor="watch-range">Activity period</label>
          <select
            id="watch-range"
            value={range}
            onChange={changeRange}
            className="h-10 border border-white/15 bg-black/30 px-3 rounded-md text-sm outline-none focus:border-primary"
          >
            {RANGE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <form onSubmit={submitSearch} className="flex items-center gap-2">
            <label className="sr-only" htmlFor="watch-search">Search rooms</label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 w-4 h-4 -translate-y-1/2 text-gray-500" />
              <input
                id="watch-search"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value.slice(0, 100))}
                placeholder="Search creator, video, code"
                className="h-10 w-58 border border-white/15 bg-black/30 pl-9 pr-3 rounded-md text-sm outline-none focus:border-primary"
              />
            </div>
            <button type="submit" className="h-10 px-3 border border-white/15 hover:border-primary hover:bg-primary/10 rounded-md text-sm transition cursor-pointer">
              Search
            </button>
          </form>
        </div>
        {pagination && <p className="text-sm text-gray-400">{pagination.total} room{pagination.total === 1 ? "" : "s"}</p>}
      </div>

      {error ? (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border border-red-300/25 bg-red-300/10 px-4 py-3 rounded-md text-sm text-red-100">
          <p>{error}</p>
          <button type="button" onClick={loadOverview} className="h-9 px-3 border border-red-200/30 hover:bg-red-200/10 rounded-md cursor-pointer">Retry</button>
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[930px] border-collapse text-nowrap">
            <thead>
              <tr className="bg-primary/50 text-left text-white">
                <th className="p-3 pl-5 font-medium">Room</th>
                <th className="p-3 font-medium">Creator</th>
                <th className="p-3 font-medium">Created</th>
                <th className="p-3 font-medium">Viewers</th>
                <th className="p-3 font-medium">Room presence</th>
                <th className="p-3 font-medium">Last activity</th>
                <th className="p-3 pr-5 font-medium text-right">Activity</th>
              </tr>
            </thead>
            <tbody className="text-sm font-light">
              {data.rooms.map((room) => (
                <tr key={room.id} className="border-b border-primary/20 bg-primary-dull/15 even:bg-primary/20">
                  <td className="p-3 pl-5 max-w-68">
                    <p className="truncate font-medium">{room.media.title}</p>
                    <p className="mt-1 font-mono text-xs tracking-[0.12em] text-gray-400">{room.code} · {room.media.source}</p>
                  </td>
                  <td className="p-3 min-w-42">{room.host.name}</td>
                  <td className="p-3 min-w-44 text-gray-300">{formatDateTime(room.createdAt)}</td>
                  <td className="p-3">
                    <span>{room.viewerCount}</span>
                    {room.activeSessionCount > 0 && <span className="ml-2 text-xs text-emerald-200">{room.activeSessionCount} live</span>}
                  </td>
                  <td className="p-3">{formatDuration(room.totalWatchSeconds)}</td>
                  <td className="p-3 min-w-44 text-gray-300">{formatDateTime(room.lastActivityAt)}</td>
                  <td className="p-3 pr-5 text-right">
                    <button
                      type="button"
                      onClick={() => loadRoomDetail(room)}
                      title={`View activity for ${room.code}`}
                      aria-label={`View activity for ${room.code}`}
                      className="w-9 h-9 inline-flex items-center justify-center border border-white/15 hover:border-primary hover:bg-primary/10 rounded-md transition cursor-pointer"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {!data.rooms.length && (
                <tr>
                  <td colSpan="7" className="px-5 py-12 text-center text-gray-400">No Watch Together rooms match this period.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {pagination?.totalPages > 1 && (
        <div className="mt-5 flex items-center justify-end gap-3 text-sm">
          <p className="text-gray-400">Page {pagination.page} of {pagination.totalPages}</p>
          <button
            type="button"
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={pagination.page <= 1}
            title="Previous page"
            aria-label="Previous page"
            className="w-9 h-9 flex items-center justify-center border border-white/15 hover:border-primary hover:bg-primary/10 disabled:opacity-40 rounded-md transition cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setPage((current) => Math.min(pagination.totalPages, current + 1))}
            disabled={pagination.page >= pagination.totalPages}
            title="Next page"
            aria-label="Next page"
            className="w-9 h-9 flex items-center justify-center border border-white/15 hover:border-primary hover:bg-primary/10 disabled:opacity-40 rounded-md transition cursor-pointer"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {selectedRoom && (
        <section className="mt-10 border-t border-white/10 pt-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.12em] text-primary">Room activity</p>
              <h2 className="mt-1 text-lg font-medium">{detail?.room.media.title || selectedRoom.media.title}</h2>
              <p className="mt-1 font-mono text-xs tracking-[0.12em] text-gray-400">{detail?.room.code || selectedRoom.code}</p>
            </div>
            <button
              type="button"
              onClick={() => { setSelectedRoom(null); setDetail(null); }}
              title="Close room activity"
              aria-label="Close room activity"
              className="w-9 h-9 flex items-center justify-center border border-white/15 hover:border-white/40 rounded-md transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {detailLoading ? (
            <div className="py-12 flex justify-center"><RefreshCw className="w-5 h-5 text-primary animate-spin" /></div>
          ) : detail ? (
            <>
              <div className="mt-5 grid grid-cols-2 md:grid-cols-3 gap-3 max-w-3xl">
                <Stat icon={UsersRound} label="Unique viewers" value={detail.summary.viewerCount} />
                <Stat icon={Radio} label="Room sessions" value={detail.summary.sessionCount} />
                <Stat icon={Clock3} label="Room presence" value={formatDuration(detail.summary.totalWatchSeconds)} />
              </div>
              <div className="mt-6 overflow-x-auto">
                <table className="w-full min-w-[760px] border-collapse text-nowrap">
                  <thead>
                    <tr className="bg-primary/50 text-left text-white">
                      <th className="p-3 pl-5 font-medium">Viewer</th>
                      <th className="p-3 font-medium">Joined</th>
                      <th className="p-3 font-medium">Left / last seen</th>
                      <th className="p-3 font-medium">Time in room</th>
                      <th className="p-3 font-medium">Reconnects</th>
                      <th className="p-3 pr-5 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="text-sm font-light">
                    {detail.sessions.map((session) => (
                      <tr key={session.id} className="border-b border-primary/20 bg-primary-dull/15 even:bg-primary/20">
                        <td className="p-3 pl-5 min-w-45">{session.user.name}</td>
                        <td className="p-3 min-w-44">{formatDateTime(session.joinedAt)}</td>
                        <td className="p-3 min-w-44">{formatDateTime(session.endedAt || session.lastSeenAt)}</td>
                        <td className="p-3">{formatDuration(session.watchSeconds)}</td>
                        <td className="p-3">{Math.max(0, session.connectionCount - 1)}</td>
                        <td className="p-3 pr-5"><SessionStatus status={session.status} /></td>
                      </tr>
                    ))}
                    {!detail.sessions.length && (
                      <tr><td colSpan="6" className="px-5 py-10 text-center text-gray-400">Nobody joined this room before it closed.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
        </section>
      )}
    </>
  );
};

export default WatchTogether;
