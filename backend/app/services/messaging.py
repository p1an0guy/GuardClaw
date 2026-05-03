from __future__ import annotations

from app.models.schemas import (
    Channel,
    OutboundMessage,
    OutboundStatus,
    TimelineEntry,
)
from app.repositories.store import SQLiteStore
from app.services.hermes_adapter import HermesAdapter


class MessagingService:
    def __init__(self, store: SQLiteStore, hermes: HermesAdapter | None = None) -> None:
        self.store = store
        self.hermes = hermes

    async def send_all(self, messages: list[OutboundMessage], incident_id: str | None = None) -> list[OutboundMessage]:
        sent: list[OutboundMessage] = []
        for message in messages:
            if message.channel == Channel.DISCORD:
                sent.append(await self.send_discord_dm(message))
            elif message.channel == Channel.CALL:
                sent.append(await self.send_call(message, incident_id=incident_id))
            elif message.channel == Channel.EMAIL:
                sent.append(await self.send_email(message))
            elif message.channel == Channel.SMS:
                sent.append(await self.send_sms(message))
            elif message.channel == Channel.TELEGRAM:
                sent.append(await self.send_telegram(message, incident_id=incident_id))
            else:
                sent.append(self._mark_failed(message, "Unsupported channel."))
        return sent

    async def send_discord_dm(self, message: OutboundMessage) -> OutboundMessage:
        return self._log_stub(message, "Discord DM")

    async def send_email(self, message: OutboundMessage) -> OutboundMessage:
        return self._log_stub(message, "Email")

    async def send_sms(self, message: OutboundMessage) -> OutboundMessage:
        return self._log_stub(message, "SMS")

    async def send_telegram(self, message: OutboundMessage, incident_id: str | None = None) -> OutboundMessage:
        if self.hermes is not None:
            return await self._send_via_hermes(message, "Telegram", incident_id=incident_id)
        return self._log_stub(message, "Telegram")

    async def send_call(self, message: OutboundMessage, incident_id: str | None = None) -> OutboundMessage:
        if self.hermes is not None:
            return await self._send_via_hermes(message, "Outbound call", incident_id=incident_id)
        return self._log_stub(message, "Outbound call")

    async def _send_via_hermes(self, message: OutboundMessage, channel_label: str, incident_id: str | None = None) -> OutboundMessage:
        updated, detail = await self.hermes.dispatch_outbound_message(message, incident_id=incident_id)
        if updated.status == OutboundStatus.SENT_VIA_HERMES:
            self.store.add_timeline(
                TimelineEntry(
                    id=updated.id,
                    incident_id=updated.incident_id,
                    kind="outbound_message",
                    title=f"{channel_label} sent through Hermes for {updated.recipient_name}",
                    detail=detail,
                    metadata={
                        "recipient_id": updated.recipient_id,
                        "recipient_name": updated.recipient_name,
                        "channel": updated.channel.value,
                        "status": updated.status.value,
                        "subject": updated.subject,
                        "body": updated.body,
                        "generated_by": updated.generated_by,
                    },
                )
            )
            return updated
        if updated.status == OutboundStatus.FAILED:
            return self._mark_failed(updated, detail)
        return self._log_stub(updated, channel_label)

    def _log_stub(self, message: OutboundMessage, channel_label: str) -> OutboundMessage:
        updated = message.model_copy(update={"status": OutboundStatus.SENT_STUB})
        self.store.add_timeline(
            TimelineEntry(
                id=updated.id,
                incident_id=updated.incident_id,
                kind="outbound_message",
                title=f"{channel_label} draft logged for {updated.recipient_name}",
                detail=(
                    f"Demo mode only: GuardClaw generated a {updated.channel.value} draft and logged it "
                    "instead of sending a real external message."
                ),
                metadata={
                    "recipient_id": updated.recipient_id,
                    "recipient_name": updated.recipient_name,
                    "channel": updated.channel.value,
                    "status": updated.status.value,
                    "subject": updated.subject,
                    "body": updated.body,
                    "generated_by": updated.generated_by,
                },
            )
        )
        return updated

    def _mark_failed(self, message: OutboundMessage, reason: str) -> OutboundMessage:
        updated = message.model_copy(update={"status": OutboundStatus.FAILED})
        self.store.add_timeline(
            TimelineEntry(
                id=updated.id,
                incident_id=updated.incident_id,
                kind="outbound_message_failed",
                title=f"Message failed for {updated.recipient_name}",
                detail=reason,
                metadata={"channel": updated.channel.value, "status": updated.status.value},
            )
        )
        return updated
