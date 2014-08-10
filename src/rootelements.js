/*********************************************
 * Root math elements with event delegation.
 ********************************************/

function createRoot(container, root, textbox, editable) {
  var contents = container.contents().detach();

  if (!textbox) {
    container.addClass('mathquill-rendered-math');
  }

  root.jQ = $('<span class="mathquill-root-block"/>').appendTo(container.attr(mqBlockId, root.id));
  root.revert = function() {
    container.empty().unbind('.mathquill')
      .removeClass('mathquill-rendered-math mathquill-editable mathquill-textbox')
      .append(contents);
  };

  root.cursor = Cursor(root);

  root.renderLatex(contents.text());
}
function setupTextarea(editable, container, root, cursor) {
  var textareaSpan = root.textarea = $('<span class="mq-textarea"></span>');
  textarea = $(document.createElement('textarea')).appendTo(textareaSpan)
  spanarea = $(document.createElement('span')).appendTo(textareaSpan)
  
  /******
   * TODO [Han]: Document this
   */
  var textareaSelectionTimeout;
  root.selectionChanged = function() {
    if (textareaSelectionTimeout === undefined) {
      textareaSelectionTimeout = setTimeout(setTextareaSelection);
    }
    forceIERedraw(container[0]);
  };
  function setTextareaSelection() {
    textareaSelectionTimeout = undefined;
    var latex = cursor.selection ? '$'+cursor.selection.latex()+'$' : '';
    root.textareaManager.select(latex);
    root.triggerSpecialEvent('selectionChanged');
  }

  // TODO - this causes issues with IE. I don't think we need it
  // since we prevent text selection with css. Would be best
  // to figure out how to fix this.
  /*
  //prevent native selection except textarea
  container.bind('selectstart.mathquill', function(e) {
    if (e.target !== textarea[0] && e.target !== spanarea[0]) e.preventDefault();
    e.stopPropagation();
  });*/

  hookUpTextarea(editable, container, root, cursor, textarea, spanarea, textareaSpan, setTextareaSelection);
}

function mouseEvents(ultimateRootjQ) {
  //drag-to-select event handling
  ultimateRootjQ.bind('mousedown.mathquill', function(e) {
    e.preventDefault();

    var container = $(e.target);
    if (!container.hasClass('mathquill-editable')) {
      container = container.closest('.mathquill-root-block').parent();
    }
    var root = MathElement[container.attr(mqBlockId) || ultimateRootjQ.attr(mqBlockId)];
    var cursor = root.cursor, blink = cursor.blink;
    var textareaSpan = root.textarea;

    if (root.ignoreMousedownTimeout !== undefined) {
      clearTimeout(root.ignoreMousedownTimeout);
      root.ignoreMousedownTimeout = undefined;
      return;
    }

    var cachedClientRect = cachedClientRectFnForNewCache();
    function mousemove(e) {
      cursor.seek($(e.target), e.clientX, e.clientY, cachedClientRect);

      if (cursor.prev !== anticursor.prev
          || cursor.parent !== anticursor.parent) {
        cursor.selectFrom(anticursor);
      }

      e.preventDefault();
    }

    // docmousemove is attached to the document, so that
    // selection still works when the mouse leaves the window.
    function docmousemove(e) {
      // [Han]: i delete the target because of the way seek works.
      // it will not move the mouse to the target, but will instead
      // just seek those X and Y coordinates.  If there is a target,
      // it will try to move the cursor to document, which will not work.
      // cursor.seek needs to be refactored.
      delete e.target;

      return mousemove(e);
    }

    function mouseup(e) {
      anticursor = undefined;
      cursor.blink = blink;
      if (!cursor.selection) {
        if (root.editable) {
          cursor.show();
        }
        else {
          textareaSpan.detach();
        }
      }

      // delete the mouse handlers now that we're not dragging anymore
      container.unbind('mousemove', mousemove);
      $(e.target.ownerDocument).unbind('mousemove', docmousemove).unbind('mouseup', mouseup);
    }

    cursor.blink = noop;
    cursor.hideHandle().seek($(e.target), e.clientX, e.clientY, cachedClientRect);

    var anticursor = {parent: cursor.parent, prev: cursor.prev, next: cursor.next};

    if (!root.editable && root.blurred) container.prepend(textareaSpan);
    root.textareaManager.focus();
    root.blurred = false;

    container.mousemove(mousemove);
    $(e.target.ownerDocument).mousemove(docmousemove).mouseup(mouseup);
  });
}

function setupTouchHandle(editable, root, cursor) {
  // event handling for touch-draggable handle
  /**
   * Usage:
   * jQ.on('touchstart', firstFingerOnly(function(touchstartCoords) {
   *   return { // either of these are optional:
   *     touchmove: function(touchmoveCoords) {},
   *     touchend: function(touchendCoords) {}
   *   };
   * });
   */
  function firstFingerOnly(ontouchstart) {
    return function(e) {
      e.preventDefault();
      var e = e.originalEvent, target = $(e.target);
      if (e.changedTouches.length < e.touches.length) return; // not first finger
      var touchstart = e.changedTouches[0];
      var handlers = ontouchstart(touchstart) || 0;
      if (handlers.touchmove) {
        target.bind('touchmove', function(e) {
          var touchmove = e.originalEvent.changedTouches[0];
          if (touchmove.id !== touchstart.id) return;
          handlers.touchmove.call(this, touchmove);
        });
      }
      target.bind('touchend', function(e) {
        var touchend = e.originalEvent.changedTouches[0];
        if (touchend.id !== touchstart.id) return;
        if (handlers.touchend) handlers.touchend.call(this, touchend);
        target.unbind('touchmove touchend');
      });
    };
  }
  var blink = cursor.blink;
  cursor.handle.on('touchstart', firstFingerOnly(function(e) {
    cursor.blink = noop;
    var cursorRect = cursor.jQ[0].getBoundingClientRect();
    var offsetX = e.clientX - cursorRect.left;
    var offsetY = e.clientY - (cursorRect.top + cursorRect.bottom)/2;
    var cachedClientRect = cachedClientRectFnForNewCache();
    var onAnimationEnd;
    root.onAnimationEnd = function() { onAnimationEnd(); };
    return {
      touchmove: function(e) {
        var adjustedX = e.clientX - offsetX, adjustedY = e.clientY - offsetY;
        cursor.seek(elAtPt(adjustedX, adjustedY, root), adjustedX, adjustedY, cachedClientRect, true);
        visualHapticFeedback();
        onAnimationEnd = visualHapticFeedback;

        function visualHapticFeedback() {
          var cursorRect = cursor.jQ[0].getBoundingClientRect();
          cursor.repositionHandle(cursorRect);

          var dx = adjustedX - cursorRect.left;
          var dy = adjustedY - (cursorRect.top + cursorRect.bottom)/2;
          var dist = Math.sqrt(dx*dx + dy*dy);
          var weight = (Math.log(dist)+1)/dist;
          var skewX = Math.atan2(weight*dx, offsetY);
          var scaleY = (weight*dy + offsetY)/offsetY;
          var steeperScale = 2*(scaleY - 1) + 1;
          cursor.handle.css({
            WebkitTransform: 'translateX(.5px) skewX('+skewX+'rad) scaleY('+scaleY+')',
            opacity: 1 - steeperScale*.5
          });
        }
      },
      touchend: function(e) {
        cursor.handle.css({ WebkitTransform: '', opacity: '' });
        cursor.blink = blink;
        cursor.show(true);
        onAnimationEnd = function() {
          cursor.repositionHandle(cursor.jQ[0].getBoundingClientRect());
          cursor.handle.css({ WebkitTransform: '', opacity: '' });
          delete root.onAnimationEnd;
        };
      }
    };
  }));
}

function hookUpTextarea(editable, container, root, cursor, textarea, spanarea, textareaSpan, setTextareaSelection) {
  if (!editable) {
    root.blurred = true;
    root.textareaManager = manageTextarea(textarea, spanarea, { container: container });
    container.bind('copy', setTextareaSelection)
      .prepend('<span class="mq-selectable">$'+root.latex()+'$</span>');
    textarea.bind('cut paste', false).blur(function() {
      cursor.clearSelection();
      setTimeout(detach); //detaching during blur explodes in WebKit
    });
    function detach() {
      textareaSpan.detach();
      root.blurred = true;
    }
    return;
  }

  root.textareaManager = manageTextarea(textarea, spanarea, {
    container: container,
    key: function(key, evt) {
      cursor.parent.bubble('onKey', key, evt);
    },
    text: function(text) {
      cursor.parent.bubble('onText', text);
    },
    cut: function(e) {
      if (cursor.selection) {
        setTimeout(function() {
          cursor.prepareEdit();
          cursor.parent.bubble('redraw');
          root.triggerSpecialEvent('render');
        });
      }

      e.stopPropagation();
      root.triggerSpecialEvent('render');
    },
    paste: function(text) {
      // FIXME HACK the parser in RootTextBlock needs to be moved to
      // Cursor::writeLatex or something so this'll work with
      // MathQuill textboxes
      if (text.slice(0,1) === '$' && text.slice(-1) === '$') {
        text = text.slice(1, -1);
      }

      cursor.writeLatex(text).show();
      root.triggerSpecialEvent('render');
    }
  });

  container.prepend(textareaSpan);
}

function rootCSSClasses(container, textbox) {
  container.addClass('mathquill-editable');
  if (textbox)
    container.addClass('mathquill-textbox');
}

function focusBlurEvents(root, cursor) {
  root.textareaManager.onFocus = function () {
    root.blurred = false;
    if (!cursor.parent)
      cursor.appendTo(root);
    cursor.parent.jQ.addClass('mq-hasCursor');
    if (cursor.selection) {
      cursor.selection.jQ.removeClass('mq-blur');
      setTimeout(root.selectionChanged); //re-select textarea contents after tabbing away and back
    }
    else {
      cursor.show();
    }
  };
  
  root.textareaManager.onBlur = function () {
    root.blurred = true;
    cursor.hide().parent.blur();
    if (cursor.selection) {
      cursor.selection.jQ.addClass('mq-blur');
    }
  };

  root.textareaManager.onBlur()
}

function desmosCustomEvents(container, root, cursor) {
  container.bind('select_all', function(e) {
    cursor.prepareMove().appendTo(root);
    while (cursor.prev) cursor.selectLeft();
  })
  .bind('custom_paste', function(e, text) {
    if (text.slice(0,1) === '$' && text.slice(-1) === '$') {
      text = text.slice(1, -1);
    }

    cursor.writeLatex(text).show();
    root.triggerSpecialEvent('render');
  });
}

function elAtPt(clientX, clientY, root) {
  var el = document.elementFromPoint(clientX, clientY);
  return $.contains(root.jQ[0], el) ? $(el) : root.jQ;
}
function cachedClientRectFnForNewCache() {
  var cache = {};
  function elById(el, id) {
    if (!cache[id]) {
      pray('only called within Cursor::seek', 'scrollLeft' in cachedClientRect);
      var rect = el.getBoundingClientRect(), dx = cachedClientRect.scrollLeft;
      cache[id] = { top: rect.top, right: rect.right + dx,
                    bottom: rect.bottom, left: rect.left + dx };
    }
    return cache[id];
  };
  function cachedClientRect(node) { return elById(node.jQ[0], node.id); };
  cachedClientRect.elById = elById;
  return cachedClientRect;
}

var RootMathBlock = P(MathBlock, function(_, _super) {
  _.latex = function() {
    return _super.latex.call(this).replace(/(\\[a-z]+) (?![a-z])/ig,'$1');
  };
  _.text = function() {
    return this.foldChildren('', function(text, child) {
      return text + child.text();
    });
  };
  _.renderLatex = function(latex) {
    var all = Parser.all;
    var eof = Parser.eof;

    var block = latexMathParser.skip(eof).or(all.result(false)).parse(latex);
    this.firstChild = this.lastChild = 0;
    if (block) {
      block.children().adopt(this, 0, 0);
    }

    var jQ = this.jQ;

    if (block) {
      var html = block.join('html');
      jQ.html(html);
      MathElement.jQize(jQ);
      this.focus().finalizeInsert();
    }
    else {
      jQ.empty();
    }

    this.cursor.appendTo(this);
  };
  _.renderSliderLatex = function(latex) {
    function makeCmd(ch) {
      var cmd;
      var code = ch.charCodeAt(0);
      if ((65 <= code && code <= 90) || (97 <= code && code <= 122))
        cmd = Variable(ch);
      else {
        if (CharCmds[ch] || LatexCmds[ch])
          cmd = (CharCmds[ch] || LatexCmds[ch])(ch);
        else {
          cmd = VanillaSymbol(ch);
        }
      }
      return cmd;
    }

    // valid assignment left-hand-sides: https://github.com/desmosinc/knox/blob/27709c6066a544f160123a6bd775829ec8cd7080/frontend/desmos/public/assets/grapher/jison/latex.jison#L13-L15
    var matches = /^([a-z])(?:_([a-z0-9]|\{[a-z0-9]+\}))?=([-0-9.]+)$/i.exec(latex);

    pray('valid restricted slider LaTeX', matches);
    var letter = matches[1];
    var subscript = matches[2];
    var value = matches[3];

    this.firstChild = this.lastChild = 0;

    letter = Variable(letter);

    if (subscript) {
      var sub = LatexCmds._('_');
      var subBlock = MathBlock().adopt(sub, 0, 0);
      sub.blocks = [ subBlock ];
      if (subscript.length === 1) {
        makeCmd(subscript).adopt(subBlock, subBlock.lastChild, 0);
      }
      else {
        for (var i = 1; i < subscript.length - 1; i += 1) {
          makeCmd(subscript.charAt(i)).adopt(subBlock, subBlock.lastChild, 0);
        }
      }
    }

    letter.adopt(this, this.lastChild, 0);
    if (sub) sub.adopt(this, this.lastChild, 0);
    LatexCmds['=']('=').adopt(this, this.lastChild, 0);
    for (var i = 0, l = value.length; i < l; i += 1) {
      var ch = value.charAt(i);
      var cmd = makeCmd(ch);
      cmd.adopt(this, this.lastChild, 0);
    }

    var jQ = this.jQ;

    var html = this.join('html');
    jQ.html(html);
    MathElement.jQize(jQ);
    //this.finalizeInsert();

    this.cursor.parent = this;
    this.cursor.prev = this.lastChild;
    this.cursor.next = 0;
  };
  _.up = function() { this.triggerSpecialEvent('upPressed'); };
  _.down = function() { this.triggerSpecialEvent('downPressed'); };
  _.moveOutOf = function(dir) { this.triggerSpecialEvent(dir+'Pressed'); };
  _.onKey = function(key, e) {
    switch (key) {
    case 'Ctrl-Shift-Backspace':
    case 'Ctrl-Backspace':
      while (this.cursor.prev || this.cursor.selection) {
        this.cursor.backspace();
      }
      break;

    case 'Shift-Backspace':
    case 'Backspace':
      this.cursor.backspace();
      this.triggerSpecialEvent('render');
      break;

    // Tab or Esc -> go one block right if it exists, else escape right.
    case 'Esc':
    case 'Tab':
      var parent = this.cursor.parent;
      // cursor is in root editable, continue default
      if (parent === this.cursor.root) return;

      this.cursor.prepareMove();
      if (parent.next) {
        // go one block right
        this.cursor.prependTo(parent.next);
      } else {
        // get out of the block
        this.cursor.insertAfter(parent.parent);
      }
      break;

    // Shift-Tab -> go one block left if it exists, else escape left.
    case 'Shift-Tab':
    case 'Shift-Esc':
      var parent = this.cursor.parent;
      //cursor is in root editable, continue default
      if (parent === this.cursor.root) return;

      this.cursor.prepareMove();
      if (parent.prev) {
        // go one block left
        this.cursor.appendTo(parent.prev);
      } else {
        //get out of the block
        this.cursor.insertBefore(parent.parent);
      }
      break;

    // Prevent newlines from showing up
    case 'Enter': this.triggerSpecialEvent('enterPressed'); break;


    // End -> move to the end of the current block.
    case 'End':
      this.cursor.prepareMove().appendTo(this.cursor.parent);
      break;

    // Ctrl-End -> move all the way to the end of the root block.
    case 'Ctrl-End':
      this.cursor.prepareMove().appendTo(this);
      break;

    // Shift-End -> select to the end of the current block.
    case 'Shift-End':
      while (this.cursor.next) {
        this.cursor.selectRight();
      }
      break;

    // Ctrl-Shift-End -> select to the end of the root block.
    case 'Ctrl-Shift-End':
      while (this.cursor.next || this.cursor.parent !== this) {
        this.cursor.selectRight();
      }
      break;

    // Home -> move to the start of the root block or the current block.
    case 'Home':
      this.cursor.prepareMove().prependTo(this.cursor.parent);
      break;

    // Ctrl-Home -> move to the start of the current block.
    case 'Ctrl-Home':
      this.cursor.prepareMove().prependTo(this);
      break;

    // Shift-Home -> select to the start of the current block.
    case 'Shift-Home':
      while (this.cursor.prev) {
        this.cursor.selectLeft();
      }
      break;

    // Ctrl-Shift-Home -> move to the start of the root block.
    case 'Ctrl-Shift-Home':
      while (this.cursor.prev || this.cursor.parent !== this) {
        this.cursor.selectLeft();
      }
      break;

    case 'Left': this.cursor.moveLeft(); break;
    case 'Shift-Left': this.cursor.selectLeft(); break;
    case 'Ctrl-Left': break;
    case 'Meta-Left': break;

    case 'Right': this.cursor.moveRight(); break;
    case 'Shift-Right': this.cursor.selectRight(); break;
    case 'Ctrl-Right': break;
    case 'Meta-Right': break;

    case 'Up': this.cursor.moveUp(); break;
    case 'Down': this.cursor.moveDown(); break;

    case 'Shift-Up':
      if (this.cursor.prev) {
        while (this.cursor.prev) this.cursor.selectLeft();
      } else {
        this.cursor.selectLeft();
      }

    case 'Shift-Down':
      if (this.cursor.next) {
        while (this.cursor.next) this.cursor.selectRight();
      }
      else {
        this.cursor.selectRight();
      }

    case 'Ctrl-Up': break;
    case 'Meta-Up': break;
    case 'Ctrl-Down': break;
    case 'Meta-Down': break;

    case 'Ctrl-Shift-Del':
    case 'Ctrl-Del':
      while (this.cursor.next || this.cursor.selection) {
        this.cursor.deleteForward();
      }
      this.triggerSpecialEvent('render');
      break;

    case 'Shift-Del':
    case 'Del':
      this.cursor.deleteForward();
      this.triggerSpecialEvent('render');
      break;

    case 'Meta-A':
    case 'Ctrl-A':
      //so not stopPropagation'd at RootMathCommand
      if (this !== this.cursor.root) return;

      this.cursor.prepareMove().appendTo(this);
      while (this.cursor.prev) this.cursor.selectLeft();
      break;

    default:
      this.scrollHoriz();
      return false;
    }
    e.preventDefault();
    this.scrollHoriz();
    return false;
  };
  _.onText = function(ch) {
    this.cursor.write(ch);
    this.triggerSpecialEvent('render');
    this.scrollHoriz();
    return false;
  };
  _.scrollHoriz = function() {
    var cursor = this.cursor, seln = cursor.selection;
    var rootRect = this.jQ[0].getBoundingClientRect();
    if (!seln) {
      var x = cursor.jQ[0].getBoundingClientRect().left;
      if (x > rootRect.right - 20) var scrollBy = x - (rootRect.right - 20);
      else if (x < rootRect.left + 20) var scrollBy = x - (rootRect.left + 20);
      else return;
    }
    else {
      var rect = seln.jQ[0].getBoundingClientRect();
      var overLeft = rect.left - (rootRect.left + 20);
      var overRight = rect.right - (rootRect.right - 20);
      if (seln.first === cursor.next) {
        if (overLeft < 0) var scrollBy = overLeft;
        else if (overRight > 0) {
          if (rect.left - overRight < rootRect.left + 20) var scrollBy = overLeft;
          else var scrollBy = overRight;
        }
        else return;
      }
      else {
        if (overRight > 0) var scrollBy = overRight;
        else if (overLeft < 0) {
          if (rect.right - overLeft > rootRect.right - 20) var scrollBy = overRight;
          else var scrollBy = overLeft;
        }
        else return;
      }
    }
    this.jQ.stop().animate({ scrollLeft: '+=' + scrollBy }, 100, this.onAnimationEnd);
  };

  //triggers a special event occured:
  //  1) pressed up and was at 'top' of equation
  //  2) pressed down and was at 'bottom' of equation
  //  3) pressed backspace and equation was empty
  //  4) the equation was rendered
  //  5) etc
  _.triggerSpecialEvent = function(eventName) {
    var jQ = this.jQ;
    setTimeout(function(){ jQ.trigger(eventName); }, 1);
  };
});

var RootMathCommand = P(MathCommand, function(_, _super) {
  _.init = function(cursor) {
    _super.init.call(this, '$');
    this.cursor = cursor;
  };
  _.htmlTemplate = '<span class="mathquill-rendered-math">&0</span>';
  _.createBlocks = function() {
    this.firstChild =
    this.lastChild =
      RootMathBlock();

    this.blocks = [ this.firstChild ];

    this.firstChild.parent = this;

    var cursor = this.firstChild.cursor = this.cursor;
    this.firstChild.onText = function(ch) {
      if (ch !== '$' || cursor.parent !== this)
        cursor.write(ch);
      else if (this.isEmpty()) {
        cursor.insertAfter(this.parent).backspace()
          .insertNew(VanillaSymbol('\\$','$')).show();
      }
      else if (!cursor.next)
        cursor.insertAfter(this.parent);
      else if (!cursor.prev)
        cursor.insertBefore(this.parent);
      else
        cursor.write(ch);

      return false;
    };
  };
  _.latex = function() {
    return '$' + this.firstChild.latex() + '$';
  };
});

var RootTextBlock = P(MathBlock, function(_) {
  _.renderLatex = function(latex) {
    var self = this
    var cursor = self.cursor;
    self.jQ.children().slice(1).remove();
    self.firstChild = self.lastChild = 0;
    cursor.show().appendTo(self);

    var regex = Parser.regex;
    var string = Parser.string;
    var eof = Parser.eof;
    var all = Parser.all;

    // Parser RootMathCommand
    var mathMode = string('$').then(latexMathParser)
      // because TeX is insane, math mode doesn't necessarily
      // have to end.  So we allow for the case that math mode
      // continues to the end of the stream.
      .skip(string('$').or(eof))
      .map(function(block) {
        // HACK FIXME: this shouldn't have to have access to cursor
        var rootMathCommand = RootMathCommand(cursor);

        rootMathCommand.createBlocks();
        var rootMathBlock = rootMathCommand.firstChild;
        block.children().adopt(rootMathBlock, 0, 0);

        return rootMathCommand;
      })
    ;

    var escapedDollar = string('\\$').result('$');
    var textChar = escapedDollar.or(regex(/^[^$]/)).map(VanillaSymbol);
    var latexText = mathMode.or(textChar).many();
    var commands = latexText.skip(eof).or(all.result(false)).parse(latex);

    if (commands) {
      for (var i = 0; i < commands.length; i += 1) {
        commands[i].adopt(self, self.lastChild, 0);
      }

      var html = self.join('html');
      MathElement.jQize(html).appendTo(self.jQ);

      this.finalizeInsert();
    }
  };
  _.onKey = RootMathBlock.prototype.onKey;
  _.onText = function(ch) {
    this.cursor.prepareEdit();
    if (ch === '$')
      this.cursor.insertNew(RootMathCommand(this.cursor));
    else
      this.cursor.insertNew(VanillaSymbol(ch));

    return false;
  };
  _.scrollHoriz = RootMathBlock.prototype.scrollHoriz;
});
