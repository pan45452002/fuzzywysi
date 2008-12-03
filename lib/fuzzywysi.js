(function($) {

  FuzzyWysi = function(textarea, toolbars, options) {
    var $textarea = $(textarea);
    var config = $.extend({}, FuzzyWysi.defaults, options);
    var doc, win, body;
    
    var ele = $('<iframe class="editor" frameborder="0"></iframe>');
    ele.bind('load', function(event) {
      doc = this.contentDocument || this.contentWindow.document;
      win = this.contentDocument ? doc.defaultView : this.contentWindow;
      body = $('body', doc.documentElement);

      doc.designMode = 'on';
      $('head', doc).append(config.style);

      $(win).blur(save).focus(save);
      $(doc).keyup(change).keypress(change).mouseup(change);
      
      load();
    });
    function document() { return doc; }
    function window() { return win; }
    
    var selection = {
      currentSelection: function() { return win.getSelection(); },
      currentNode: function() {
        // if it's a text-based node, just get it's parent
        // otherwise just iterate through all nodes until we find one whose text matches
        if (this.currentSelection().anchorNode.toString().match(/Text/))
          return $(this.currentSelection().getRangeAt(0).commonAncestorContainer).parent();
        else {
          var range = doc.createRange();
          var selected, tripped=false;
          $('*', this.currentSelection().anchorNode).each(function() {
            // TODO this will fail on f.e.: <p><b>fail</b>, <b>fail</b></p>
            if ($(this).text() == this.currentSelection().toString() && tripped==false){
              selected = $(this); 
              tripped = true;
            }
          });
          return selected;
        }
      },

      query: function(command) {
        if ($.inArray(command, ['bold','italic','underline','strikethrough']) > -1) {
          return document().queryCommandState(command);
        } else if ($.isFunction(config.queries[command])) {
          return config.queries[command](this.currentNode());
        } else { return null; }
      },
      exec: function(command, value) { doc.execCommand(command, false, value); },
      
      focus: function() { win.focus(); }
    }
    
    for (toolbar in toolbars) { toolbars[toolbar].setCallback(selection); }

    // content
    var filters = new FuzzyWysi.Filterchain(config.filters);

    function content(text) {
      if (text) { body.html(filters.input(text)); }
      else { return filters.output(body.html()); }
    }
    
    // persistence
    function save() { $textarea.val(content()); }
    function load() { content($textarea.val()); }
    
    // events
    function change() {
      save();
      $.each(toolbars, function() { this.update(); })
      if ($.isFunction(config.changeCallback)) { config.changeCallback(); }
    }
    
    $textarea.before(ele);
    
    return {
      config: config,
      document: document,
      window: window,
      selection: selection,
      content: content,
      filters: filters,
      save: save,
      load: load
    };
  };
  
  FuzzyWysi.defaults = {
    filters: ['FuzzyWysi.Filters.tidy'],
    queries: {},
    style: '<style>body {margin:0; padding:0;} a {color:blue; text-decoration:none}</style>'
  }
  
  FuzzyWysi.Filterchain = function(chain) {
    function filters(direction, text) {
      for (var filter in chain) {
        if (typeof chain[filter] == 'string')
          { chain[filter] = eval(chain[filter]); }

        if (jQuery.isFunction(chain[filter])) 
          { text = chain[filter](text); }
        else if (jQuery.isFunction(chain[filter][direction])) 
          { text = chain[filter][direction](text); }
      }
      return text;
    }
    function output(text) { return filters('output', text); }
    function input(text)  { return filters('input', text); }

    return {
      chain: chain,
      output: output,
      input: input
    }
  }

})(jQuery);

// credit to Josh Peek and WysiHat for most of the actual code, 
// I've just broken it down a bit more.
FuzzyWysi.Filters = {
  // Normalizes and Tidies XHTML content
  // * fixes line breaks
  // * downcases tag names
  // * closes break tags
  tidy: function(text) {
    // Remove IE's linebreaks
    text = text.replace(/\r\n?/g, "\n");

    // Downcase tags
    text = text.replace(/<([A-Z]+)([^>]*)>/g, function(match) {
      return '<' + match[0].toLowerCase() + match[1] + '>';
    });

    text = text.replace(/<\/([A-Z]+)>/g, function(match) {
      return '</' + match[0].toLowerCase() + '>';
    });

    // Close linebreak elements
    text = text.replace(/<br>/g, "<br />");

    return text;
  }
}

FuzzyWysi.Toolbar = function(ele, options) {
  var $toolbar = $(ele);
  var config = jQuery.extend({}, options)
  var commands = [];
  var callbacks;
  
  $toolbar.children('.button').each(function() {
    var button = $(this)
    commands.push(button.attr('command'));
    button.click(function(event) {
      event.preventDefault();
      command = button.attr('command');
      if (config[command]) {
        if (! button.attr('class').match('active')) {
          config[command].activate(run);
        } else {
          config[command].deactivate(run);
        }
      } else { run(command); }
      callbacks.focus();
    })
  })
  
  function update() {
    jQuery.each(commands, function() {
      if(callbacks.query(this.toString())) { setActive(this); } 
      else { setInActive(this); }
    })
  }
  
  function setCallback(obj) { callbacks = obj; }
  
  function setActive(btn) { 
    $(':not(.active)[command='+btn+']').addClass('active');
    if (config[btn] && jQuery.isFunction(config[btn].onActive)) {
      config[btn].onActive($toolbar, btn, callbacks.currentNode());
    }
  }
  function setInActive(btn) { 
    $('.active[command='+btn+']').removeClass('active');
    if (config[btn] && jQuery.isFunction(config[btn].onInActive)) {
      config[btn].onInActive($toolbar, btn);
    }
  }

  function run(command, value) {
    callbacks.exec(command, value);
    update();
  }
  
  return {
    setCallback: setCallback,
    update: update
  }
}
