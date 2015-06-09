var entityMap = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': '&quot;',
  "'": '&#39;',
  "/": '&#x2F;'
};

function escapeHtml(string) {
  return String(string).replace(/[&<>"'\/]/g, function(s) {
    return entityMap[s];
  });
}

function formatTime(unixTimestamp) {
  var date = new Date();
  date.setTime(unixTimestamp);
  return date.toLocaleString();
}

function handleChat(chat) {
  $("#chat-table").append("<tr class='chat-row'>" +
    "<td class='chat-name'>" + escapeHtml(chat.name) + "</td>" +
    "<td class='chat-message'>" + escapeHtml(chat.message) + "</td>" +
    "<td class='chat-time'>" + formatTime(chat.timestamp) + "</td></tr>");
}

var socket = io.connect();

socket.on('existing-chats', function(chats) {
  $(".chat-row").remove();
  $(".chat-notice").remove();
  if (chats.length == 0) {
    $("#chat-table").append("<tr class='chat-notice'>" +
      "<td class='chat-name'>:(</td>" +
      "<td class='chat-message'>No message yet.</td>" +
      "<td class='chat-time'></td></tr>");
  } else {
    chats.forEach(function(chat) {
      handleChat(chat);
    });
  }
  $("#chat-table-container")[0].scrollTop = $("#chat-table-container")[0].scrollHeight - $("#chat-table-container").height();
});

socket.on('incoming-chat', function(chat) {
  $(".chat-notice").fadeOut();
  handleChat(chat);
  $('#chat-table-container').stop().animate({
    scrollTop: $("#chat-table-container")[0].scrollHeight - $('#chat-table-container').height(),
  }, 'slow');
});

var firstLoad = true;

socket.on('status', function(status) {
  $("#max-cps-rank").empty();
  $("#total-chats-rank").empty();
  if (firstLoad) {
    $("#max-cps-table").slideUp(0);
    $("#total-chats-table").slideUp(0);
  }
  status.max_cpss.forEach(function(cps) {
    $("#max-cps-rank").append("<tr><td>" + cps[0] + "</td><td>" + cps[1] + "</td></tr>");
  });
  status.totals.forEach(function(total) {
    $("#total-chats-rank").append("<tr><td>" + total[0] + "</td><td>" + total[1] + "</td></tr>");
  });
  if (firstLoad) {
    $("#max-cps-table").slideDown(function() {
      $("#total-chats-table").slideDown();
    });
  }
  firstLoad = false;

  $("#cps").text(status.cps);
  $("#online").text(status.online);
  $("#system-load").text(status.system_load);
});

function sendMessage() {
  var name = $("#name-input").val();
  var message = $("#message-input").val();
  if (name.length == 0 || message.length == 0) {
    return;
  }
  socket.emit('new-message', {
    'name': name,
    'message': message
  });
  $("#message-input").val("");
}

$("#submit-btn").click(function() {
  sendMessage();
});

$("#name-input").focus(function() {
  $(this).data("hasfocus", true);
});

$("#name-input").blur(function() {
  $(this).data("hasfocus", false);
});

$("#message-input").focus(function() {
  $(this).data("hasfocus", true);
});

$("#message-input").blur(function() {
  $(this).data("hasfocus", false);
});

$(document.body).keyup(function(ev) {
  if (ev.which === 13 && ($("#name-input").data("hasfocus") || $("#message-input").data("hasfocus"))) {
    sendMessage();
  }
});
