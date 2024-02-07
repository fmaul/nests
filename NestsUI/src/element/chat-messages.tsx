import { EventKind, NostrEvent, NostrLink, RequestBuilder, parseZap } from "@snort/system";
import { useRequestBuilder, useUserProfile } from "@snort/system-react";
import { useMemo } from "react";
import Avatar from "./avatar";
import { hexToBech32 } from "@snort/shared";
import DisplayName from "./display-name";

export default function ChatMessages({ link }: { link: NostrLink }) {
  const sub = useMemo(() => {
    const rb = new RequestBuilder(`chat-messages:${link.id}`);
    rb.withOptions({ leaveOpen: true })
      .withFilter()
      .kinds([1311 as EventKind, EventKind.ZapReceipt])
      .replyToLink([link]);

    return rb;
  }, [link]);

  const messages = useRequestBuilder(sub);

  return (
    <div className="flex flex-col-reverse gap-3 px-5">
      {messages.map((a) => {
        switch (a.kind) {
          case EventKind.ZapReceipt: {
            return <ChatZap event={a} key={a.id} />;
          }
          default: {
            return <ChatMessage event={a} key={a.id} />;
          }
        }
      })}
    </div>
  );
}

function ChatMessage({ event }: { event: NostrEvent }) {
  const profile = useUserProfile(event.pubkey);

  return (
    <div className="grid grid-cols-[32px_auto] gap-2">
      <Avatar pubkey={event.pubkey} size={32} link={false} />
      <div className="flex flex-col text-sm">
        <div className="text-medium leading-8">
          {profile?.display_name ?? profile?.name ?? hexToBech32("nput", event.pubkey).slice(0, 12)}
        </div>
        {event.content}
      </div>
    </div>
  );
}

function ChatZap({ event }: { event: NostrEvent }) {
  const zap = parseZap(event);
  const senderProfile = useUserProfile(zap.sender);
  const targetProfile = useUserProfile(zap.receiver);
  return (
    <div className="border border-delete rounded-2xl px-3 py-4">
      <DisplayName pubkey={zap.sender ?? event.pubkey} profile={senderProfile} />
      <span> zapped </span>
      <DisplayName pubkey={zap.receiver ?? event.pubkey} profile={targetProfile} />
      <span> {zap.amount / 1000}K sats</span>
      <div>{zap.content}</div>
    </div>
  );
}
