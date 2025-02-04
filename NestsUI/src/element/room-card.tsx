import { NostrEvent, NostrLink } from "@snort/system";
import ListenerCount from "./listener-count";
import Avatar from "./avatar";
import { useUserProfile } from "@snort/system-react";
import { Link, useNavigate } from "react-router-dom";
import { AvatarStack } from "./avatar-stack";
import classNames from "classnames";
import { useNestsApi } from "../hooks/useNestsApi";
import useRoomPresence from "../hooks/useRoomPresence";
import { ColorPalette } from "../const";
import StartTime from "./start-time";
import { CSSProperties, useMemo, useState } from "react";
import IconButton from "./icon-button";
import Modal from "./modal";
import EditRoom from "./edit-room";
import { useLogin } from "../login";
import { useNostrRoom } from "../hooks/nostr-room-context";
import { FormattedMessage } from "react-intl";
import DisplayName from "./display-name";

export default function RoomCard({
  event,
  inRoom,
  className,
  link,
  join,
  presenceEvents,
  showDescription,
}: {
  event: NostrEvent;
  inRoom?: boolean;
  className?: string;
  link?: boolean;
  join?: boolean;
  presenceEvents?: Array<NostrEvent>;
  showDescription?: boolean;
}) {
  const profile = useUserProfile(event.pubkey);
  const title = event.tags.find((a) => a[0] === "title")?.[1];
  const summary = event.tags.find((a) => a[0] === "summary")?.[1];
  const color = event.tags.find((a) => a[0] === "color")?.[1] ?? ColorPalette[0];
  const status = event.tags.find((a) => a[0] === "status")?.[1];
  const starts = event.tags.find((a) => a[0] === "starts")?.[1];
  const image = event.tags.find((a) => a[0] === "image")?.[1];
  const navigate = useNavigate();
  const [editRoom, setEditRoom] = useState(false);
  const api = useNestsApi();
  const login = useLogin();

  const eventLink = useMemo(() => NostrLink.fromEvent(event), [event]);
  const loadedPresence = useRoomPresence(presenceEvents === undefined ? eventLink : undefined);
  const presence = presenceEvents ?? loadedPresence;
  const roomContext = useNostrRoom();

  async function joinRoom() {
    if (!api) return;
    const id = event.tags.find((a) => a[0] === "d")?.[1];
    if (id) {
      const { token } = await api.joinRoom(id);
      navigate(`/${NostrLink.fromEvent(event).encode()}`, {
        state: {
          event: event,
          token,
        },
      });
    }
  }

  const inner = () => {
    const styles = {} as CSSProperties;
    if (image) {
      styles.backgroundImage = `url(${image})`;
      styles.backgroundPosition = "center";
      styles.backgroundSize = "cover";
    }
    return (
      <div
        className={classNames(
          "relative px-6 py-4 rounded-3xl flex flex-col gap-3",
          image ? "" : `bg-${color}`,
          { "cursor-pointer": (link ?? true) || join },
          className,
        )}
        onClick={() => {
          if (join) {
            joinRoom();
          }
        }}
        style={styles}
      >
        {inRoom && event.pubkey === login.pubkey && (
          <div className="absolute right-2 top-2">
            <IconButton
              name="gear"
              className="rounded-2xl aspect-square !bg-white/10 hover:!bg-white/20"
              onClick={() => setEditRoom(true)}
            />
          </div>
        )}
        <div className="flex justify-between">
          <div className="flex gap-4 items-center">
            {status === "live" ? <ListenerCount n={presence.length} /> : <StartTime n={Number(starts)} />}
            {inRoom && roomContext.info?.recording === true && (
              <div className="px-2 py-1 flex gap-1 items-center bg-white rounded-full text-delete font-semibold text-sm">
                <span className="rounded-full w-4 h-4 bg-delete animate-pulse"></span>
                REC
              </div>
            )}
          </div>
          {!inRoom && (
            <div className="flex items-center gap-2">
              <AvatarStack>
                {presence.slice(0, 6).map((a) => (
                  <Avatar pubkey={a.pubkey} outline={2} size={32} link={false} />
                ))}
              </AvatarStack>
            </div>
          )}
        </div>
        <div className="text-2xl font-semibold">{title}</div>
        {showDescription && <div className="text-sm">{summary}</div>}
        {!inRoom && (
          <div className="flex gap-2 items-center">
            <Avatar pubkey={event.pubkey} outline={2} size={32} link={true} />
            <span>
              <FormattedMessage
                defaultMessage="Hosted by {name}"
                values={{
                  name: <DisplayName pubkey={event.pubkey} profile={profile} />,
                }}
              />
            </span>
          </div>
        )}
        {editRoom && (
          <Modal id="edit-room" onClose={() => setEditRoom(false)}>
            <EditRoom event={event} onClose={() => setEditRoom(false)} />
          </Modal>
        )}
      </div>
    );
  };

  if ((link ?? true) && !join) {
    return (
      <Link to={`/${NostrLink.fromEvent(event).encode()}`} state={{ event }}>
        {inner()}
      </Link>
    );
  }
  return inner();
}
