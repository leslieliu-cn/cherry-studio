import { LoadingOutlined } from '@ant-design/icons'
import XunfeiTextCorrectionService, { TextCorrectionResult } from '@renderer/services/XunfeiTextCorrectionService'
import type { ActionItem } from '@renderer/types/selectionTypes'
import { Button, Space, Tooltip } from 'antd'
import { SpellCheck, X } from 'lucide-react'
import { FC, useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import styled from 'styled-components'

import WindowFooter from './WindowFooter'

interface Props {
  action: ActionItem
  scrollToBottom: () => void
}

const ActionTypoCheck: FC<Props> = ({ action, scrollToBottom }) => {
  const { t } = useTranslation()

  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [contentToCopy, setContentToCopy] = useState('')
  const [result, setResult] = useState<TextCorrectionResult | null>(null)
  const [abortController, setAbortController] = useState<AbortController | null>(null)
  const [hoveredCorrectionIndex, setHoveredCorrectionIndex] = useState<number | null>(null)
  const [ignoredCorrections, setIgnoredCorrections] = useState<Set<number>>(new Set())

  const fetchResult = useCallback(async () => {
    if (!action.selectedText) return

    setIsLoading(true)
    setError('')
    setResult(null)

    // 创建新的AbortController
    const controller = new AbortController()
    setAbortController(controller)

    try {
      // 调用讯飞API进行敏感词检测
      const checkResult = await XunfeiTextCorrectionService.checkText(action.selectedText)
      console.log(checkResult, 'checkResult')
      // 检查是否被取消
      if (controller.signal.aborted) {
        return
      }

      setResult(checkResult)

      if (checkResult.success) {
        // 初始设置为格式化的结果，后续会根据忽略状态更新
        const formattedContent = XunfeiTextCorrectionService.formatResult(checkResult)
        setContentToCopy(formattedContent)
      } else {
        setError(checkResult.message || '检测失败')
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        const errorMessage = err instanceof Error ? err.message : '检测服务暂时不可用'
        setError(errorMessage)
      }
    } finally {
      if (!controller.signal.aborted) {
        setIsLoading(false)
        setAbortController(null)
        scrollToBottom?.()
      }
    }
  }, [action.selectedText, scrollToBottom])

  useEffect(() => {
    fetchResult()
  }, [fetchResult])

  // 处理忽略错误
  const handleIgnoreCorrection = useCallback((index: number) => {
    setIgnoredCorrections((prev) => new Set([...prev, index]))
  }, [])

  // 计算显示的文本，包含高亮标记
  const displayText = useMemo(() => {
    if (!result?.correctedText || !result.corrections) {
      return result?.originalText || ''
    }

    let text = result.originalText
    let offset = 0

    // 获取未被忽略的纠错项，并保持原始索引
    const validCorrectionsWithIndex = result.corrections
      .map((correction, originalIndex) => ({ ...correction, originalIndex }))
      .filter(({ originalIndex }) => !ignoredCorrections.has(originalIndex))
      .sort((a, b) => a.position - b.position)

    validCorrectionsWithIndex.forEach((correction) => {
      const start = correction.position + offset
      const end = start + correction.original.length
      const isHovered = hoveredCorrectionIndex === correction.originalIndex

      const highlightClass = isHovered ? 'highlighted' : 'corrected'
      const replacement = `<span class="${highlightClass}" data-correction="${correction.originalIndex}">${correction.corrected}</span>`

      text = text.substring(0, start) + replacement + text.substring(end)
      offset += replacement.length - correction.original.length
    })

    return text
  }, [result, ignoredCorrections, hoveredCorrectionIndex])

  // 获取有效的错误列表（未被忽略的）
  const validCorrections = useMemo(() => {
    if (!result?.corrections) return []
    return result.corrections.filter((_, index) => !ignoredCorrections.has(index))
  }, [result?.corrections, ignoredCorrections])

  // 当忽略状态改变时，更新复制内容
  useEffect(() => {
    if (result && result.success) {
      // 创建一个临时的结果对象，只包含未被忽略的纠错项
      const filteredResult = {
        ...result,
        corrections: validCorrections
      }
      const formattedContent = XunfeiTextCorrectionService.formatResult(filteredResult)
      setContentToCopy(formattedContent)
    }
  }, [result, validCorrections])

  // 渲染检测结果
  const renderResult = () => {
    if (!result) return null

    if (!result.success) {
      return (
        <ErrorContainer>
          <div className="error-message">{result.message}</div>
        </ErrorContainer>
      )
    }

    if (!result.corrections || result.corrections.length === 0) {
      return (
        <ResultContainer>
          <div className="success-message">✅ {result.message || '未发现明显的敏感词汇或不当表达。'}</div>
        </ResultContainer>
      )
    }

    return (
      <TwoColumnContainer>
        {/* 左侧：修正后的文本 */}
        <LeftPanel>
          <div className="panel-title">📝 修正后的文本</div>
          <CorrectedTextContainer dangerouslySetInnerHTML={{ __html: displayText }} />
        </LeftPanel>

        {/* 右侧：错误列表 */}
        <RightPanel>
          <div className="panel-title">🔍 发现的问题 ({validCorrections.length})</div>
          <CorrectionsList>
            {result.corrections.map((correction, index) => {
              const isIgnored = ignoredCorrections.has(index)
              if (isIgnored) return null

              return (
                <CorrectionItem
                  key={index}
                  onMouseEnter={() => setHoveredCorrectionIndex(index)}
                  onMouseLeave={() => setHoveredCorrectionIndex(null)}
                  className={hoveredCorrectionIndex === index ? 'hovered' : ''}>
                  <div className="correction-header">
                    <span className="correction-index">{index + 1}.</span>
                    <span className="correction-type">{correction.description}</span>
                    <IgnoreButton
                      size="small"
                      type="text"
                      icon={<X size={12} />}
                      onClick={() => handleIgnoreCorrection(index)}
                      title="忽略此项"
                    />
                  </div>
                  <div className="correction-content">
                    <div className="original">原文: "{correction.original}"</div>
                    <div className="corrected">建议: "{correction.corrected}"</div>
                    {correction.confidence && (
                      <div className="confidence">置信度: {(correction.confidence * 100).toFixed(1)}%</div>
                    )}
                  </div>
                </CorrectionItem>
              )
            })}
          </CorrectionsList>
        </RightPanel>
      </TwoColumnContainer>
    )
  }

  const handlePause = () => {
    if (abortController) {
      abortController.abort()
      setAbortController(null)
      setIsLoading(false)
    }
  }

  const handleRegenerate = () => {
    setContentToCopy('')
    setResult(null)
    setError('')
    setIgnoredCorrections(new Set())
    setHoveredCorrectionIndex(null)
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
          {isLoading && (
            <LoadingContainer>
              <LoadingOutlined spin />
              <span style={{ marginLeft: 8 }}>正在检测敏感词汇...</span>
            </LoadingContainer>
          )}
          {renderResult()}
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

const ResultContainer = styled.div`
  .success-message {
    padding: 16px;
    background: var(--color-success-bg, #f6ffed);
    border: 1px solid var(--color-success-border, #b7eb8f);
    border-radius: 6px;
    color: var(--color-success, #52c41a);
    font-size: 14px;
    line-height: 1.6;
  }
`

const TwoColumnContainer = styled.div`
  display: flex;
  gap: 16px;
  height: 100%;
  min-height: 400px;
`

const LeftPanel = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;

  .panel-title {
    font-size: 16px;
    font-weight: 600;
    color: var(--color-text);
    margin-bottom: 12px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--color-border);
  }
`

const RightPanel = styled.div`
  width: 200px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;

  .panel-title {
    font-size: 16px;
    font-weight: 600;
    color: var(--color-text);
    margin-bottom: 12px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--color-border);
  }
`

const CorrectedTextContainer = styled.div`
  flex: 1;
  padding: 16px;
  background: var(--color-background-soft, #fafafa);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  font-size: 14px;
  line-height: 1.6;
  color: var(--color-text);
  white-space: pre-wrap;
  word-break: break-word;
  overflow-y: auto;

  .corrected {
    background: var(--color-success-bg, #f6ffed);
    color: var(--color-success, #52c41a);
    padding: 2px 4px;
    border-radius: 3px;
    border: 1px solid var(--color-success-border, #b7eb8f);
  }

  .highlighted {
    background: var(--color-warning-bg, #fffbe6);
    color: var(--color-warning, #faad14);
    padding: 2px 4px;
    border-radius: 3px;
    border: 1px solid var(--color-warning-border, #ffe58f);
    box-shadow: 0 0 0 2px var(--color-warning-border, #ffe58f);
  }
`

const CorrectionsList = styled.div`
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
`

const CorrectionItem = styled.div`
  padding: 12px;
  background: var(--color-warning-bg, #fffbe6);
  border: 1px solid var(--color-warning-border, #ffe58f);
  border-radius: 6px;
  transition: all 0.2s ease;
  cursor: pointer;

  &:hover,
  &.hovered {
    border-color: var(--color-warning, #faad14);
    box-shadow: 0 2px 8px rgba(250, 173, 20, 0.15);
  }

  .correction-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
  }

  .correction-index {
    font-weight: 600;
    color: var(--color-warning, #faad14);
    min-width: 20px;
  }

  .correction-type {
    background: var(--color-warning, #faad14);
    color: white;
    padding: 2px 8px;
    border-radius: 12px;
    font-size: 12px;
    font-weight: 500;
    flex: 1;
  }

  .correction-content {
    font-size: 14px;
    line-height: 1.5;
  }

  .original {
    color: var(--color-error, #ff4d4f);
    margin-bottom: 4px;
  }

  .corrected {
    color: var(--color-success, #52c41a);
    margin-bottom: 4px;
  }

  .confidence {
    font-size: 12px;
    color: var(--color-text-2);
  }
`

const IgnoreButton = styled(Button)`
  opacity: 0;
  transition: opacity 0.2s ease;

  ${CorrectionItem}:hover & {
    opacity: 1;
  }

  &:hover {
    color: var(--color-error, #ff4d4f);
    border-color: var(--color-error, #ff4d4f);
  }
`

export default ActionTypoCheck
