/*********************************************************
 * The actual jQuery plugin and document ready handlers.
 ********************************************************/

//The publicy exposed method of jQuery.prototype, available (and meant to be
//called) on jQuery-wrapped HTML DOM elements.
$.fn.mathquill = function(cmd, latex) {
  switch (cmd) {
  case 'focus':
  case 'blur':
    return this.each(function() {
      var blockId = $(this).attr(mqBlockId),
        block = blockId && MathElement[blockId];
      if (block && block.textarea)
        block.textarea.children().trigger(cmd);
    });
  case 'onKey':
  case 'onText':
    return this.each(function() {
      var blockId = $(this).attr(mqBlockId),
        block = blockId && MathElement[blockId],
        cursor = block && block.cursor;

      if (cursor) {
        cursor.parent.bubble(cmd, latex, { preventDefault: noop });
        if (block.blurred) cursor.hide().parent.blur();
      }
    });
  case 'redraw':
    return this.each(function() {
      var blockId = $(this).attr(mqBlockId),
        rootBlock = blockId && MathElement[blockId];
      if (rootBlock) {
        (function postOrderRedraw(el) {
          el.eachChild(postOrderRedraw);
          if (el.redraw) el.redraw();
        }(rootBlock));
      }
    });
  case 'revert':
    return this.each(function() {
      var blockId = $(this).attr(mqBlockId),
        block = blockId && MathElement[blockId];
      if (block && block.revert)
        block.revert();
    });
  case 'sliderLatex':
    return this.each(function() {
      var blockId = $(this).attr(mqBlockId),
        block = blockId && MathElement[blockId];
      if (block) {

        //fixes bug with highlighting everything and then setting state with latex
        //https://github.com/desmosinc/knox/issues/1115
        cursor = block && block.cursor;
        if (cursor) cursor.clearSelection();
        block.renderSliderLatex(latex);
        block.triggerSpecialEvent('render');
      }
    });
  case 'latex':
    if (arguments.length > 1) {
      return this.each(function() {
        var blockId = $(this).attr(mqBlockId),
          block = blockId && MathElement[blockId];
        if (block) {
          //fixes bug with highlighting everything and then setting state with latex
          //https://github.com/desmosinc/knox/issues/1115
          cursor = block && block.cursor;
          if (cursor) cursor.clearSelection();
          block.renderLatex(latex);
          block.triggerSpecialEvent('render');
        }
      });
    }

    var blockId = $(this).attr(mqBlockId),
      block = blockId && MathElement[blockId];
    return block && block.latex();
  case 'text':
    var blockId = $(this).attr(mqBlockId),
      block = blockId && MathElement[blockId];
    return block && block.text();
  case 'html':
    return this.children('.mathquill-root-block').html().replace(/ ?mq-hasCursor|mq-hasCursor /, '')
      .replace(/ class=(""|(?= |>))/g, '')
      .replace(/<span class="?mq-cursor( mq-blink)?"?>.?<\/span>/i, '');
  case 'write':
    if (arguments.length > 1)
      return this.each(function() {
        var blockId = $(this).attr(mqBlockId),
          block = blockId && MathElement[blockId],
          cursor = block && block.cursor;

        if (cursor) {
          cursor.writeLatex(latex)
          if (block.blurred) cursor.hide().parent.blur();
        }
      });
  case 'cmd':
    if (arguments.length > 1)
      return this.each(function() {
        var blockId = $(this).attr(mqBlockId),
          block = blockId && MathElement[blockId],
          cursor = block && block.cursor;

        if (cursor) {
          if (/^\\[a-z]+$/i.test(latex)) {
            var selection = cursor.selection;
            if (selection) {
              cursor.prev = selection.first.prev;
              cursor.next = selection.last.next;
              delete cursor.selection;
            }
            cursor.insertCmd(latex.slice(1), selection);
          }
          else
            cursor.insertCh(latex);
          if (block.blurred) cursor.hide().parent.blur();
        }
      });
  case 'touchtap':
    var touchstartTarget = arguments[1], x = arguments[2], y = arguments[3];
    return this.each(function() {
      var blockId = $(this).attr(mqBlockId),
        block = blockId && MathElement[blockId],
        cursor = block && block.cursor;
      if (cursor && touchstartTarget !== cursor.handle[0]) {
        var wasBlurred = block.blurred;
        block.textarea.children().focus();
        cursor.seek(elAtPt(x, y, block), x, y, cachedClientRectFnForNewCache(), true);
        if (!wasBlurred) cursor.showHandle();
      }
    });
  case 'ignoreNextMousedown':
    var time = arguments[1];
    return this.each(function() {
      var blockId = $(this).attr(mqBlockId),
        block = blockId && MathElement[blockId];
      if (block) {
        block.ignoreMousedownTimeout = setTimeout(function() {
          block.ignoreMousedownTimeout = undefined;
        }, time);
      }
    });
  case 'moveStart':
    var blockId = $(this).attr(mqBlockId),
      block = blockId && MathElement[blockId];
    if (block && block.cursor)
      block.cursor.prependTo(block);
    break;
  case 'moveEnd':
    var blockId = $(this).attr(mqBlockId),
      block = blockId && MathElement[blockId];
    if (block && block.cursor)
      block.cursor.appendTo(block);
    break;
  case 'isAtStart':
    var blockId = $(this).attr(mqBlockId),
      block = blockId && MathElement[blockId],
      cursor = block && block.cursor;
    if (cursor) return cursor.parent === cursor.root && !cursor.prev;
    break;
  case 'isAtEnd':
    var blockId = $(this).attr(mqBlockId),
      block = blockId && MathElement[blockId],
      cursor = block && block.cursor;
    if (cursor) return cursor.parent === cursor.root && !cursor.next;
    break;
  case 'selection':
    var blockId = $(this).attr(mqBlockId),
      block = blockId && MathElement[blockId],
      cursor = block && block.cursor;
    if (!cursor) return;
    return cursor.selection ? '$'+cursor.selection.latex()+'$' : '';
  case 'clearSelection':
    return this.each(function() {
      var blockId = $(this).attr(mqBlockId),
        block = blockId && MathElement[blockId],
        cursor = block && block.cursor;
      if (cursor) {
        cursor.clearSelection();
        if (block.blurred) cursor.hide().parent.blur();
      }
    });
  default:
    var textbox = cmd === 'textbox',
      editable = textbox || cmd === 'editable',
      RootBlock = textbox ? RootTextBlock : RootMathBlock;
    return this.each(function() {
      createRoot($(this), RootBlock(), textbox, editable);
    });
  }
};

//on document ready, mathquill-ify all `<tag class="mathquill-*">latex</tag>`
//elements according to their CSS class.
$(function() {
  $('.mathquill-editable:not(.mathquill-rendered-math)').mathquill('editable');
  $('.mathquill-textbox:not(.mathquill-rendered-math)').mathquill('textbox');
  $('.mathquill-embedded-latex').mathquill();
});

