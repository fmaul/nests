import { NostrEvent, NostrLink, RequestBuilder } from "@snort/system";
import { useRequestBuilder } from "@snort/system-react";
import { useMemo } from "react";
import RoomCard from "../element/room-card";
import { PrimaryButton } from "../element/button";
import { Link } from "react-router-dom";
import { DefaultRelays, ROOM_KIND, ROOM_PRESENCE } from "../const";
import { FormattedMessage } from "react-intl";
import { unixNow } from "@snort/shared";
import { PRESENCE_TIME } from "../hooks/usePresence";
import { updateRelays } from "../utils";
import { useLogin } from "../login";

export default function RoomList() {
  const login = useLogin();
  const sub = useMemo(() => {
    updateRelays(DefaultRelays);
    const rb = new RequestBuilder(`rooms:${login.lobbyType}`);
    const fx = rb.withFilter().kinds([ROOM_KIND]);
    if (login.lobbyType === "following" && login.follows) {
      fx.authors(login.follows.filter((a) => a[0] === "p").map((a) => a[1]));
    }

    return rb;
  }, [login.follows, login.lobbyType]);

  const events = useRequestBuilder(sub);

  return (
    <div className="lg:mx-auto max-lg:px-4 lg:w-[35rem] flex flex-col gap-8">
      <RoomListList events={events} showCreateWhenEmpty={true} />
    </div>
  );
}

export function RoomListList({
  events,
  showCreateWhenEmpty,
  showEmptyRooms,
}: {
  events: Array<NostrEvent>;
  showCreateWhenEmpty: boolean;
  showEmptyRooms?: boolean;
}) {
  const subPresence = useMemo(() => {
    if (events.length > 0) {
      const rb = new RequestBuilder("presence:room-list");
      const fx = rb.withOptions({ leaveOpen: true }).withFilter().kinds([ROOM_PRESENCE]);
      fx.replyToLink(events.map((a) => NostrLink.fromEvent(a)));

      return rb;
    }
  }, [events]);

  const roomPresence = useRequestBuilder(subPresence);

  const eventsWithPresence = useMemo(() => {
    return events
      .map((a) => {
        const aLink = NostrLink.fromEvent(a);
        const pres = roomPresence.filter((b) => aLink.isReplyToThis(b));
        return {
          event: a,
          presence: pres.filter((a) => a.created_at >= unixNow() - PRESENCE_TIME * 1.2),
        };
      })
      .sort((a, b) => (a.presence.length > b.presence.length ? -1 : 1));
  }, [events, roomPresence]);

  const liveRooms = eventsWithPresence.filter((a) => {
    const status = a.event.tags.find((a) => a[0] === "status")?.[1];
    return status === "live" && (showEmptyRooms || a.presence.length > 0);
  });
  const plannedRooms = eventsWithPresence.filter((a) => {
    const status = a.event.tags.find((a) => a[0] === "status")?.[1];
    const starts = Number(a.event.tags.find((a) => a[0] === "starts")?.[1]);
    return status === "planned" && starts + 60 * 60 > unixNow();
  });
  return (
    <>
      {(liveRooms.length > 0 || showCreateWhenEmpty) && (
        <h1 className="text-3xl font-semibold">
          <FormattedMessage defaultMessage="Active Rooms" />
        </h1>
      )}
      <div className="flex flex-col gap-6">
        {liveRooms.map((a) => (
          <RoomCard event={a.event} key={a.event.id} join={true} presenceEvents={a.presence} inRoom={false} />
        ))}
        {liveRooms.length === 0 && showCreateWhenEmpty && (
          <div className="px-6 py-4 rounded-3xl flex flex-col gap-3 bg-foreground flex flex-col gap-2">
            <FormattedMessage defaultMessage="There are no active rooms yet." />
            <Link to="/new">
              <PrimaryButton>
                <FormattedMessage defaultMessage="Start a new room" />
              </PrimaryButton>
            </Link>
          </div>
        )}
      </div>
      {(showCreateWhenEmpty || plannedRooms.length > 0) && (
        <h1 className="text-3xl font-semibold">
          <FormattedMessage defaultMessage="Scheduled" />
        </h1>
      )}
      <div className="flex flex-col gap-6">
        {plannedRooms.map((a) => (
          <RoomCard event={a.event} key={a.event.id} join={true} presenceEvents={a.presence} inRoom={false} />
        ))}
        {plannedRooms.length === 0 && showCreateWhenEmpty && (
          <div className="px-6 py-4 rounded-3xl flex flex-col gap-3 bg-foreground flex flex-col gap-2">
            <FormattedMessage defaultMessage="There are no scheduled rooms right now." />
            <Link to="/new">
              <PrimaryButton>
                <FormattedMessage defaultMessage="Schedule a room" />
              </PrimaryButton>
            </Link>
          </div>
        )}
      </div>
    </>
  );
}
