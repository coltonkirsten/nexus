import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import {
  sendMail,
  getMailbox,
  markAsRead,
  markAllAsRead,
  getUnreadCount,
  getAllUnreadCounts,
} from '../services/mailbox.js';
import { getAgent, enqueueMessage } from '../services/agents.js';
import { emitTeamEvent, getTeam } from '../services/teams.js';
import { notifyNewMessage } from '../services/queueConsumer.js';
import type { MailDirection, FileAttachment } from '../types.js';

const router = Router();

// GET /api/teams/mailbox/unread-counts — all teams unread counts (must be before :teamId routes)
router.get('/mailbox/unread-counts', async (_req: Request, res: Response) => {
  try {
    const counts = await getAllUnreadCounts();
    res.json({ counts });
  } catch (error) {
    console.error('Error getting unread counts:', error);
    res.status(500).json({ error: 'Failed to get unread counts' });
  }
});

// GET /api/teams/:teamId/mailbox — list mail
router.get('/:teamId/mailbox', async (req: Request, res: Response) => {
  try {
    const { teamId } = req.params;
    const { direction, unreadOnly, limit } = req.query;

    const team = await getTeam(teamId);
    if (!team) {
      res.status(404).json({ error: 'Team not found' });
      return;
    }

    const messages = await getMailbox(teamId, {
      direction: direction as MailDirection | undefined,
      unreadOnly: unreadOnly === 'true',
      limit: limit ? parseInt(limit as string, 10) : undefined,
    });

    res.json({ messages });
  } catch (error) {
    console.error('Error getting mailbox:', error);
    res.status(500).json({ error: 'Failed to get mailbox' });
  }
});

// POST /api/teams/:teamId/mailbox — human sends mail to agent
router.post('/:teamId/mailbox', async (req: Request, res: Response) => {
  try {
    const { teamId } = req.params;
    const { agentId, subject, body, replyToId, attachments } = req.body as {
      agentId: string;
      subject: string;
      body: string;
      replyToId?: string;
      attachments?: FileAttachment[];
    };

    if (!agentId || !subject || !body) {
      res.status(400).json({ error: 'agentId, subject, and body are required' });
      return;
    }

    const team = await getTeam(teamId);
    if (!team) {
      res.status(404).json({ error: 'Team not found' });
      return;
    }

    const agent = await getAgent(agentId);
    if (!agent) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }

    // Store the mail message
    const mail = await sendMail({
      teamId,
      direction: 'human_to_agent',
      agentId,
      agentName: agent.name,
      subject,
      body,
      replyToId,
      attachments,
    });

    // Build message for agent including attachment info
    let prefixedMessage = `[Human Mail] Subject: ${subject}\n\n${body}`;
    if (attachments && attachments.length > 0) {
      const attachmentList = attachments.map(a => `- ${a.originalName} (${a.mimeType}, ${Math.round(a.size / 1024)}KB): /api/uploads/${a.filename}`).join('\n');
      prefixedMessage += `\n\n[Attachments]\n${attachmentList}`;
    }

    // Enqueue as a user message so the agent receives it
    try {
      await enqueueMessage(agentId, prefixedMessage, 'user', {
        mailMessageId: mail.id,
        fromHumanMail: true,
        attachments,
      });
      notifyNewMessage(agentId);
    } catch {
      // Agent might not be running — mail is stored either way
    }

    // Emit team event
    try {
      await emitTeamEvent({
        id: uuidv4(),
        teamId,
        type: 'mail_sent',
        timestamp: new Date().toISOString(),
        agentId,
        agentName: agent.name,
        data: {
          subject,
          direction: 'human_to_agent',
          messageId: mail.id,
          hasAttachments: attachments && attachments.length > 0,
        },
      });
    } catch { /* best-effort */ }

    res.json({ message: mail });
  } catch (error) {
    console.error('Error sending mail:', error);
    res.status(500).json({ error: 'Failed to send mail' });
  }
});

// POST /api/teams/:teamId/mailbox/from-agent — agent sends mail to human
router.post('/:teamId/mailbox/from-agent', async (req: Request, res: Response) => {
  try {
    const { teamId } = req.params;
    const { agentId, agentName, subject, body, category, replyToId, metadata } = req.body;

    if (!agentId || !subject || !body) {
      res.status(400).json({ error: 'agentId, subject, and body are required' });
      return;
    }

    const team = await getTeam(teamId);
    if (!team) {
      res.status(404).json({ error: 'Team not found' });
      return;
    }

    // Store the mail
    const mail = await sendMail({
      teamId,
      direction: 'agent_to_human',
      agentId,
      agentName: agentName || agentId,
      subject,
      body,
      category,
      replyToId,
      metadata,
    });

    // Emit team event
    try {
      await emitTeamEvent({
        id: uuidv4(),
        teamId,
        type: 'mail_received',
        timestamp: new Date().toISOString(),
        agentId,
        agentName: agentName || agentId,
        data: {
          subject,
          category,
          direction: 'agent_to_human',
          messageId: mail.id,
        },
      });
    } catch { /* best-effort */ }

    res.json({ message: mail });
  } catch (error) {
    console.error('Error receiving mail from agent:', error);
    res.status(500).json({ error: 'Failed to receive mail' });
  }
});

// PATCH /api/teams/:teamId/mailbox/:messageId/read — mark single message read
router.patch('/:teamId/mailbox/:messageId/read', async (req: Request, res: Response) => {
  try {
    const { teamId, messageId } = req.params;
    const message = await markAsRead(teamId, messageId);

    if (!message) {
      res.status(404).json({ error: 'Message not found' });
      return;
    }

    res.json({ message });
  } catch (error) {
    console.error('Error marking mail as read:', error);
    res.status(500).json({ error: 'Failed to mark as read' });
  }
});

// POST /api/teams/:teamId/mailbox/mark-all-read — mark all agent_to_human messages read
router.post('/:teamId/mailbox/mark-all-read', async (req: Request, res: Response) => {
  try {
    const { teamId } = req.params;
    const count = await markAllAsRead(teamId);
    res.json({ success: true, count });
  } catch (error) {
    console.error('Error marking all as read:', error);
    res.status(500).json({ error: 'Failed to mark all as read' });
  }
});

// GET /api/teams/:teamId/mailbox/unread-count — unread count for one team
router.get('/:teamId/mailbox/unread-count', async (req: Request, res: Response) => {
  try {
    const { teamId } = req.params;
    const count = await getUnreadCount(teamId);
    res.json({ count });
  } catch (error) {
    console.error('Error getting unread count:', error);
    res.status(500).json({ error: 'Failed to get unread count' });
  }
});

export default router;
