import { LoadingOutlined } from '@ant-design/icons'
import { useTopicMessages } from '@renderer/hooks/useMessageOperations'
import MessageContent from '@renderer/pages/home/Messages/MessageContent'
import { getDefaultAssistant, getDefaultModel, getDefaultTopic } from '@renderer/services/AssistantService'
import { Assistant, Topic } from '@renderer/types'
import type { ActionItem } from '@renderer/types/selectionTypes'
import { abortCompletion } from '@renderer/utils/abortController'
import { Space, Tooltip } from 'antd'
import { SpellCheck } from 'lucide-react'
import { FC, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import styled from 'styled-components'

import { processMessages } from './ActionUtils'
import WindowFooter from './WindowFooter'

interface Props {
  action: ActionItem
  scrollToBottom: () => void
}

const ActionTypoCheck: FC<Props> = ({ action, scrollToBottom }) => {
  const { t } = useTranslation()

  const [error, setError] = useState('')
  const [isContented, setIsContented] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [contentToCopy, setContentToCopy] = useState('')

  // Use useRef for values that shouldn't trigger re-renders
  const initialized = useRef(false)
  const assistantRef = useRef<Assistant | null>(null)
  const topicRef = useRef<Topic | null>(null)
  const askId = useRef('')

  // Initialize values only once when action changes
  useEffect(() => {
    if (initialized.current || !action.selectedText) return
    initialized.current = true

    // Initialize assistant
    const currentAssistant = getDefaultAssistant()
    const defaultModel = getDefaultModel()

    currentAssistant.model = defaultModel
    currentAssistant.settings = {
      temperature: 0.3 // Lower temperature for more consistent sensitive word detection
    }

    assistantRef.current = currentAssistant

    // Initialize topic
    topicRef.current = getDefaultTopic(currentAssistant.id)
  }, [action])

  const fetchResult = useCallback(async () => {
    if (!assistantRef.current || !topicRef.current || !action.selectedText) return

    const setAskId = (id: string) => {
      askId.current = id
    }
    const onStream = () => {
      setIsContented(true)
      scrollToBottom?.()
    }
    const onFinish = (content: string) => {
      setContentToCopy(content)
      setIsLoading(false)
    }
    const onError = (error: Error) => {
      setIsLoading(false)
      setError(error.message)
    }

    setIsLoading(true)

    // Initialize prompt content for sensitive word detection
    const userContent = `请检查以下文本中的敏感词汇、不当表达和潜在风险内容，并提供修正建议：

${action.selectedText}

请按以下格式回复：
1. 如果没有发现敏感内容，请回复"未发现明显的敏感词汇或不当表达。"
2. 如果发现敏感内容，请列出具体的敏感词汇和修正建议，并在最后提供完整的修正版本。`

    processMessages(assistantRef.current, topicRef.current, userContent, setAskId, onStream, onFinish, onError)
  }, [action, scrollToBottom])

  useEffect(() => {
    fetchResult()
  }, [fetchResult])

  const allMessages = useTopicMessages(topicRef.current?.id || '')

  const messageContent = useMemo(() => {
    const assistantMessages = allMessages.filter((message) => message.role === 'assistant')
    const lastAssistantMessage = assistantMessages[assistantMessages.length - 1]
    return lastAssistantMessage ? <MessageContent key={lastAssistantMessage.id} message={lastAssistantMessage} /> : null
  }, [allMessages])

  const handlePause = () => {
    if (askId.current) {
      abortCompletion(askId.current)
      setIsLoading(false)
    }
  }

  const handleRegenerate = () => {
    setContentToCopy('')
    setIsLoading(true)
    fetchResult()
  }

  return (
    <>
      <Container>
        <MenuContainer>
          <Tooltip placement="bottom" title={t('selection.action.builtin.typo-check')} arrow>
            <SpellCheck size={16} style={{ flexShrink: 0 }} />
          </Tooltip>
          <Space style={{ marginLeft: 8, color: 'var(--color-text-2)', fontSize: '14px' }}>
            {t('selection.action.builtin.typo-check')}
          </Space>
        </MenuContainer>
        <ContentContainer>
          {error && (
            <ErrorContainer>
              <div className="error-message">{error}</div>
            </ErrorContainer>
          )}
          {isLoading && !isContented && (
            <LoadingContainer>
              <LoadingOutlined spin />
              <span style={{ marginLeft: 8 }}>{t('common.loading')}...</span>
            </LoadingContainer>
          )}
          {messageContent && <MessageContainer>{messageContent}</MessageContainer>}
        </ContentContainer>
      </Container>
      <WindowFooter loading={isLoading} content={contentToCopy} onPause={handlePause} onRegenerate={handleRegenerate} />
    </>
  )
}

const Container = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
`

const MenuContainer = styled.div`
  display: flex;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-background);
  flex-shrink: 0;
`

const ContentContainer = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 16px;
`

const ErrorContainer = styled.div`
  padding: 12px;
  background: var(--color-error-bg);
  border: 1px solid var(--color-error-border);
  border-radius: 6px;
  margin-bottom: 16px;

  .error-message {
    color: var(--color-error);
    font-size: 14px;
  }
`

const LoadingContainer = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px;
  color: var(--color-text-2);
`

const MessageContainer = styled.div`
  .message-content {
    font-size: 14px;
    line-height: 1.6;
  }
`

export default ActionTypoCheck