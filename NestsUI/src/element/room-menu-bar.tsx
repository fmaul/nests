import { NostrLink } from "@snort/system";
import { ReactNode, useEffect, useRef, useState } from "react";
import IconButton from "./icon-button";
import { useLocalParticipant } from "@livekit/components-react";
import { useNavigate } from "react-router-dom";
import { useLogin } from "../login";
import { createPortal } from "react-dom";
import classNames from "classnames";
import Icon from "../icon";
import { hexToBech32 } from "@snort/shared";
import { useIsAdmin } from "../hooks/useIsAdmin";
import { useNestsApi } from "../hooks/useNestsApi";
import { useNostrRoom } from "../hooks/nostr-room-context";
import { RoomRecording } from "../api";
import Modal from "./modal";
import dayjs from "dayjs";
import Async from "./async";

export function RoomOptionsButton({ link }: { link: NostrLink; }) {
  const [open, setOpen] = useState(false);
  const login = useLogin();
  const ref = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [recordings, setRecordings] = useState<Array<RoomRecording>>();
  const [w, setW] = useState(230);
  const navigate = useNavigate();
  const isAdmin = useIsAdmin();
  const localParticipant = useLocalParticipant();
  const api = useNestsApi();
  const roomContext = useNostrRoom();

  const menuItem = (icon: string, text: ReactNode, onClick: () => void, className?: string) => {
    return (
      <div
        className={classNames(
          "flex items-center gap-3 px-4 py-3 first:pt-4 last:pb-4 hover:bg-foreground hover:text-primary transition cursor-pointer select-none",
          className
        )}
        onClick={onClick}
      >
        <Icon name={icon} />
        <div>{text}</div>
      </div>
    );
  };

  useEffect(() => {
    const t = setInterval(() => {
      const elm = menuRef.current;
      if (!elm) return;
      if (elm.offsetWidth !== 0) {
        setW(elm.offsetWidth);
      }
    }, 100);
    return () => clearInterval(t);
  }, []);

  return (
    <>
      <IconButton
        className={`rounded-full aspect-square${open ? " text-highlight" : ""}`}
        name="dots"
        size={25}
        ref={ref}
        onClick={() => setOpen((s) => !s)} />
      {open &&
        ref.current &&
        createPortal(
          <div
            className="absolute bg-foreground-2 flex flex-col rounded-2xl select-none overflow-hidden whitespace-nowrap"
            ref={menuRef}
            style={{
              bottom: window.innerHeight - ref.current.getBoundingClientRect().top + 15,
              left: Math.min(window.innerWidth - w, ref.current.getBoundingClientRect().left),
            }}
          >
            {login.pubkey &&
              menuItem("person", "Profile", () => {
                navigate(`/${hexToBech32("npub", login.pubkey)}`);
              })}
            {menuItem("copy", "Copy Room Link", () => {
              window.navigator.clipboard.writeText(
                `${window.location.protocol}//${window.location.host}/${link.encode()}`
              );
              setOpen(false);
            })}
            {localParticipant.microphoneTrack &&
              login.pubkey &&
              menuItem("exit", "Leave Stage", async () => {
                await api.updatePermissions(link.id, login.pubkey!, { can_publish: false });
                setOpen(false);
              })}
            {isAdmin && menuItem("audio", "Stream Audio", () => { })}
            {isAdmin && roomContext.info?.recording === false && menuItem("rec", "Start Recording", async () => {
              await api.startRecording(link.id);
              setOpen(false);
            })}
            {isAdmin && roomContext.info?.recording === true && menuItem("stop-rec", "Stop Recording", async () => {
              const recs = await api.listRecording(link.id);
              if (recs) {
                const activeRecording = recs.find(a => a.stopped === undefined);
                if (activeRecording) {
                  await api.stopRecording(link.id, activeRecording.id);
                  setOpen(false);
                }
              }
            })}
            {isAdmin && menuItem("folder", "Room Recordings", async () => {
              const recs = await api.listRecording(link.id);
              setRecordings(recs);
              setOpen(false);
            })}
          </div>,
          document.body
        )}
      {recordings && <Modal id="room-recordings" onClose={() => setRecordings(undefined)}>
        <h2 className="text-center mb-4">Room Recordings</h2>
        <div className="flex flex-col gap-2">
          {recordings.map(a => <div className="flex items-center justify-between">
            <div>
              <span>{dayjs(new Date(a.started * 1000)).format("LLL")}</span>
              {a.stopped !== undefined && <span className="text-xs opacity-50"> {((a.stopped - a.started) / 60).toFixed(0)} mins</span>}
            </div>
            <div className="flex gap-2 items-center">
              <Async className="text-highlight cursor-pointer select-none" onClick={async () => {
                const blob = await api.getRecording(link.id, a.id);
                const atag = document.createElement("a");
                atag.href = URL.createObjectURL(blob);
                atag.download = `${a.id}.mp4`;
                atag.click();
              }}>
                Download
              </Async>
              <IconButton name="trash" className="text-delete rounded-xl" onClick={async () => {
                await api.deleteRecording(link.id, a.id);
                setRecordings(rx => rx?.filter(b => b.id !== a.id))
              }} />
            </div>
          </div>)}
        </div>
      </Modal>}
    </>
  );
}