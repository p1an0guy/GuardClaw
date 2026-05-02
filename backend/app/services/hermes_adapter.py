from __future__ import annotations

import json
from typing import Any

import httpx

from app.core.config import Settings
from app.models.schemas import (
    ActionPlan,
    AlertClassification,
    AlertLevel,
    CameraSignal,
    HouseholdState,
    OutboundMessage,
    OutboundStatus,
    ThreatEvent,
)


class HermesAdapter:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    async def refine_action_plan_messages(
        self, event: ThreatEvent, household: HouseholdState, plan: ActionPlan
    ) -> tuple[ActionPlan, str | None]:
        if not self.settings.use_hermes:
            return plan, "Hermes disabled; using deterministic local message drafts."
        if not self.settings.hermes_api_key:
            return plan, "Hermes enabled but HERMES_API_KEY is not set; using local message drafts."

        try:
            content = await self._call_hermes(event, household, plan)
            updates = self._parse_message_updates(content)
        except Exception as exc:
            return plan, f"Hermes unavailable; using local message drafts. Detail: {exc}"

        if not updates:
            return plan, "Hermes returned no usable message updates; using local message drafts."

        by_id = {item["id"]: item for item in updates if isinstance(item, dict) and item.get("id")}
        refined_messages: list[OutboundMessage] = []
        for message in plan.outbound_messages:
            update = by_id.get(message.id)
            if not update:
                refined_messages.append(message)
                continue
            refined_messages.append(
                message.model_copy(
                    update={
                        "subject": str(update.get("subject") or message.subject),
                        "body": str(update.get("body") or message.body),
                        "generated_by": "hermes",
                    }
                )
            )

        return plan.model_copy(update={"outbound_messages": refined_messages, "generated_by": "risk_engine+hermes"}), None

    async def classify_alert(
        self,
        event: ThreatEvent,
        household: HouseholdState,
        camera_signal: CameraSignal | None,
    ) -> tuple[AlertClassification | None, str]:
        if not self.settings.use_hermes:
            return None, "Hermes disabled; classification will use local fallback."
        if not self.settings.hermes_api_key:
            return None, "Hermes enabled but HERMES_API_KEY is not set; classification will use local fallback."

        last_error = "unknown error"
        for attempt in range(2):
            try:
                content = await self._call_hermes_classifier(event, household, camera_signal, attempt)
                classification = self._parse_classification(content)
                return classification, f"Hermes classification accepted on attempt {attempt + 1}."
            except Exception as exc:
                last_error = str(exc)

        return None, f"Hermes classification invalid after retry; using local fallback. Detail: {last_error}"

    async def dispatch_outbound_message(self, message: OutboundMessage) -> tuple[OutboundMessage, str]:
        if not self.settings.use_hermes or not self.settings.hermes_api_key:
            return message, "Hermes unavailable; message remains a demo timeline draft."

        prompt = {
            "task": "Dispatch this GuardClaw household alert using the requested channel.",
            "constraints": [
                "Use Telegram for telegram messages and the configured calling tool for calls.",
                "Do not claim emergency dispatch or official action.",
                "Return strict JSON only with status and detail.",
            ],
            "message": message.model_dump(mode="json"),
            "response_shape": {"status": "sent|queued|failed", "detail": "string"},
        }
        try:
            content = await self._call_chat(
                system="You are GuardClaw's Hermes dispatcher. Use available messaging/call tools, then return compact JSON.",
                prompt=prompt,
                temperature=0.1,
            )
            parsed = json.loads(content)
            status = str(parsed.get("status") or "queued").lower()
            detail = str(parsed.get("detail") or "Hermes accepted the dispatch request.")
            if status in {"sent", "queued"}:
                return message.model_copy(update={"status": OutboundStatus.SENT_VIA_HERMES}), detail
            return message.model_copy(update={"status": OutboundStatus.FAILED}), detail
        except Exception as exc:
            return message.model_copy(update={"status": OutboundStatus.FAILED}), f"Hermes dispatch failed: {exc}"

    async def _call_hermes(self, event: ThreatEvent, household: HouseholdState, plan: ActionPlan) -> str:
        prompt = {
            "task": "Refine GuardClaw outbound message drafts. Keep them calm, concise, and explicit that this is demo mode.",
            "constraints": [
                "Return strict JSON only.",
                "Do not change recipients, channels, or message ids.",
                "Do not claim a real emergency dispatch occurred.",
                "Do not include private data beyond the provided household context.",
            ],
            "event": event.model_dump(mode="json"),
            "household": household.model_dump(mode="json"),
            "messages": [message.model_dump(mode="json") for message in plan.outbound_messages],
            "response_shape": {"messages": [{"id": "message id", "subject": "string", "body": "string"}]},
        }
        return await self._call_chat(
            system="You are GuardClaw's Hermes runtime adapter. Return compact JSON and no prose.",
            prompt=prompt,
            temperature=0.2,
        )

    async def _call_hermes_classifier(
        self,
        event: ThreatEvent,
        household: HouseholdState,
        camera_signal: CameraSignal | None,
        attempt: int,
    ) -> str:
        prompt = {
            "task": "Classify the urgency of this GuardClaw household alert.",
            "levels": {
                "minor": "Low impact. Notify only the primary guardian.",
                "moderate": "Meaningful household concern. Notify guardians/parents.",
                "major": "Potentially serious. Notify guardians and directly affected household members.",
                "life_threatening": "Immediate danger. Notify every household member now.",
            },
            "constraints": [
                "Return strict JSON only.",
                "level must be one of: minor, moderate, major, life_threatening.",
                "Do not invent official orders or missing facts.",
                "Treat confirmed home occupancy, Needs Help status, children at home, and extreme source severity as escalators.",
            ],
            "retry_instruction": "Previous output was invalid; strictly match the response shape."
            if attempt > 0
            else None,
            "event": event.model_dump(mode="json"),
            "camera_signal": camera_signal.model_dump(mode="json") if camera_signal else None,
            "household": household.model_dump(mode="json"),
            "response_shape": {
                "level": "minor|moderate|major|life_threatening",
                "confidence": 0.0,
                "rationale": "string",
                "source_notes": ["string"],
            },
        }
        return await self._call_chat(
            system="You are GuardClaw's safety classifier. Return strict JSON and no prose.",
            prompt=prompt,
            temperature=0.0,
        )

    async def _call_chat(self, system: str, prompt: dict[str, Any], temperature: float) -> str:
        url = f"{self.settings.hermes_api_base_url.rstrip('/')}/chat/completions"
        headers = {"Authorization": f"Bearer {self.settings.hermes_api_key}"}
        payload = {
            "model": self.settings.hermes_model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": json.dumps(prompt)},
            ],
            "temperature": temperature,
            "stream": False,
        }
        async with httpx.AsyncClient(timeout=self.settings.hermes_timeout_seconds) as client:
            response = await client.post(url, headers=headers, json=payload)
            response.raise_for_status()
            data = response.json()
        return str(data["choices"][0]["message"]["content"])

    def _parse_message_updates(self, content: str) -> list[dict[str, Any]]:
        parsed = json.loads(content)
        messages = parsed.get("messages")
        return messages if isinstance(messages, list) else []

    def _parse_classification(self, content: str) -> AlertClassification:
        parsed = json.loads(content)
        return AlertClassification(
            level=AlertLevel(str(parsed["level"])),
            confidence=float(parsed.get("confidence", 0.7)),
            rationale=str(parsed["rationale"]),
            classified_by="hermes",
            source_notes=[
                str(item)
                for item in parsed.get("source_notes", [])
                if isinstance(item, str) or item is not None
            ],
        )
