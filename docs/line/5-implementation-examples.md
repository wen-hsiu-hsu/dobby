# 5. 實作範例

### Python (使用 LINE Bot SDK)

```python
from linebot import LineBotApi, WebhookHandler
from linebot.models import (
    MessageEvent, TextMessage, TextSendMessage,
    ImageSendMessage, QuickReply, QuickReplyButton,
    MessageAction, PostbackAction
)

line_bot_api = LineBotApi('Channel Access Token')
handler = WebhookHandler('Channel Secret')

@handler.add(MessageEvent, message=TextMessage)
def handle_message(event):
    # 回覆簡單文字訊息
    line_bot_api.reply_message(
        event.reply_token,
        TextSendMessage(text='Hello, world!')
    )

@handler.add(MessageEvent, message=TextMessage)
def handle_message_with_quick_reply(event):
    # 帶有 Quick Reply 的訊息
    quick_reply = QuickReply(
        items=[
            QuickReplyButton(
                action=MessageAction(label="Yes", text="Yes")
            ),
            QuickReplyButton(
                action=MessageAction(label="No", text="No")
            ),
            QuickReplyButton(
                action=PostbackAction(
                    label="Confirm",
                    data="action=confirm&id=123"
                )
            )
        ]
    )
    
    line_bot_api.reply_message(
        event.reply_token,
        TextSendMessage(
            text='Do you agree?',
            quick_reply=quick_reply
        )
    )

@handler.add(MessageEvent, message=TextMessage)
def handle_image_message(event):
    # 回覆圖片訊息
    line_bot_api.reply_message(
        event.reply_token,
        ImageSendMessage(
            original_content_url='https://example.com/original.jpg',
            preview_image_url='https://example.com/preview.jpg'
        )
    )
```

### JavaScript/Node.js (使用 @line/bot-sdk)

```javascript
const line = require('@line/bot-sdk');

const client = new line.Client({
  channelAccessToken: 'Channel Access Token'
});

// 回覆訊息
async function replyMessage(replyToken) {
  const message = {
    type: 'text',
    text: 'Hello, world!'
  };
  
  return await client.replyMessage(replyToken, message);
}

// 帶有 Quick Reply 的訊息
async function replyWithQuickReply(replyToken) {
  const message = {
    type: 'text',
    text: 'Choose an option:',
    quickReply: {
      items: [
        {
          type: 'action',
          action: {
            type: 'message',
            label: 'Yes',
            text: 'Yes'
          }
        },
        {
          type: 'action',
          action: {
            type: 'postback',
            label: 'Confirm',
            data: 'action=confirm&id=123',
            text: 'Item confirmed'
          }
        }
      ]
    }
  };
  
  return await client.replyMessage(replyToken, message);
}

// 回覆多個訊息
async function replyMultipleMessages(replyToken) {
  const messages = [
    {
      type: 'text',
      text: 'Message 1'
    },
    {
      type: 'text',
      text: 'Message 2'
    },
    {
      type: 'image',
      originalContentUrl: 'https://example.com/original.jpg',
      previewImageUrl: 'https://example.com/preview.jpg'
    }
  ];
  
  return await client.replyMessage(replyToken, messages);
}
```

### cURL

```bash
curl -X POST https://api.line.me/v2/bot/message/reply \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer Channel_Access_Token' \
  -d '{
    "replyToken": "nHuyWiB7yP5Zw52FIkcQobQuGDXCTA",
    "messages": [
      {
        "type": "text",
        "text": "Hello, world!"
      }
    ]
  }'
```
