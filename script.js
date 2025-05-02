let timeTableData;
let dayScheduleData;
let currentDirection = "産業大学前発";
let upcomingBusCount = 5;

// 初期化関数
async function init() {
    try {
        // データの読み込み
        const [timeResponse, dayResponse] = await Promise.all([
            fetch('time.json'),
            fetch('day.json')
        ]);
        
        timeTableData = await timeResponse.json();
        dayScheduleData = await dayResponse.json();
        
        // タブ切り替えの設定
        setupTabs();
        
        // 初回表示
        updateDisplay();
        
        // 1分ごとに更新
        setInterval(updateDisplay, 60 * 1000);
    } catch (error) {
        console.error('データの読み込みに失敗しました:', error);
        document.body.innerHTML = `
            <div class="error-message">
                <h2>エラーが発生しました</h2>
                <p>時刻データの読み込みに失敗しました。ページを再読み込みしてください。</p>
                <p>エラー詳細: ${error.message}</p>
            </div>
        `;
    }
}

// タブ切り替え設定
function setupTabs() {
    const tabButtons = document.querySelectorAll('.tab-btn');
    
    tabButtons.forEach(button => {
        button.addEventListener('click', function() {
            tabButtons.forEach(btn => btn.classList.remove('active'));
            this.classList.add('active');
            currentDirection = this.dataset.direction;
            updateDisplay();
        });
    });
}

// 現在の日付に基づいて適用すべき時刻表を取得
function getApplicableSchedule(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const dateString = `${month}-${day}`;
    const dayOfWeek = date.getDay(); // 0: 日曜日, 6: 土曜日
    
    const scheduleInfo = {
        type: '',
        details: '',
        timetableId: '',
        isOperating: true
    };
    
    // 日付から運行情報を判断
    const { schedule_summary } = dayScheduleData;
    
    // 無料乗車日のチェック
    const freeRideDates = schedule_summary.free_ride.dates[year] || [];
    if (freeRideDates.includes(dateString)) {
        scheduleInfo.type = schedule_summary.free_ride.description;
        scheduleInfo.timetableId = "1-A";  // 平日臨時増便ダイヤを使用
        return scheduleInfo;
    }
    
    // 休み（運休）のチェック
    const noServiceDates = schedule_summary.no_service.specific_dates[year] || [];
    if (noServiceDates.includes(dateString) || (dayOfWeek === 0 && !freeRideDates.includes(dateString))) {
        scheduleInfo.type = schedule_summary.no_service.description;
        scheduleInfo.isOperating = false;
        return scheduleInfo;
    }
    
    // 夏季限定ダイヤのチェック
    const summerScheduleDates = schedule_summary.summer_limited_schedule.dates[year] || [];
    if (summerScheduleDates.includes(dateString)) {
        scheduleInfo.type = schedule_summary.summer_limited_schedule.description;
        scheduleInfo.timetableId = "3";
        return scheduleInfo;
    }
    
    // 土曜日の場合
    if (dayOfWeek === 6) {
        scheduleInfo.type = "土曜ダイヤ";
        scheduleInfo.timetableId = "2";
        return scheduleInfo;
    }
    
    // デフォルトは平日
    scheduleInfo.type = "平日ダイヤ";
    scheduleInfo.timetableId = "1-B";
    return scheduleInfo;
}

// 次と次々のバスを取得
function getNextBuses(direction, hour, minute) {
    const applicableSchedule = getApplicableSchedule(new Date());
    if (!applicableSchedule.isOperating) {
        return {
            next: null,
            afterNext: null,
            upcomingBuses: []
        };
    }
    
    // 適用すべき時刻表を取得
    const timetable = timeTableData.timetables.find(t => t.id === applicableSchedule.timetableId);
    if (!timetable || !timetable.schedule[direction]) {
        return {
            next: null,
            afterNext: null,
            upcomingBuses: []
        };
    }
    
    const scheduleForDirection = timetable.schedule[direction];
    const upcomingBuses = [];
    
    // 今日の残りの時間帯で全てのバスを取得
    for (let h = hour; h <= 23; h++) {
        if (scheduleForDirection[h]) {
            const minutesForHour = scheduleForDirection[h];
            for (const m of minutesForHour) {
                if (h > hour || (h === hour && m >= minute)) {
                    upcomingBuses.push({ hour: h, minute: m });
                }
            }
        }
    }
    
    // 明日の時刻表も確認（深夜バス対応）
    if (upcomingBuses.length < 2) {
        for (let h = 0; h <= 6; h++) {
            if (scheduleForDirection[h]) {
                const minutesForHour = scheduleForDirection[h];
                for (const m of minutesForHour) {
                    upcomingBuses.push({ 
                        hour: h, 
                        minute: m, 
                        isNextDay: true 
                    });
                    if (upcomingBuses.length >= upcomingBusCount + 2) break;
                }
            }
            if (upcomingBuses.length >= upcomingBusCount + 2) break;
        }
    }
    
    return {
        next: upcomingBuses[0] || null,
        afterNext: upcomingBuses[1] || null,
        upcomingBuses: upcomingBuses.slice(2, upcomingBusCount + 2)
    };
}

// 残り時間を計算
function calculateRemainingTime(hour, minute, isNextDay = false) {
    const now = new Date();
    const busTime = new Date();
    
    busTime.setHours(hour, minute, 0, 0);
    if (isNextDay) {
        busTime.setDate(busTime.getDate() + 1);
    }
    
    const diffMs = busTime - now;
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    
    if (diffMinutes < 60) {
        return `あと${diffMinutes}分`;
    } else {
        const hours = Math.floor(diffMinutes / 60);
        const minutes = diffMinutes % 60;
        return `あと${hours}時間${minutes}分`;
    }
}

// 時刻をフォーマット
function formatTime(hour, minute) {
    return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
}

// 日付をフォーマット
function formatDate(date) {
    const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
    return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日(${dayNames[date.getDay()]})`;
}

// 表示を更新
function updateDisplay() {
    const now = new Date();
    const hour = now.getHours();
    const minute = now.getMinutes();
    
    // 現在時刻の表示
    document.getElementById('currentTime').textContent = formatTime(hour, minute);
    
    // 日付情報の表示
    document.getElementById('currentDate').textContent = formatDate(now);
    
    // 適用中のダイヤ種別を取得
    const applicableSchedule = getApplicableSchedule(now);
    document.getElementById('scheduleType').textContent = applicableSchedule.type;
    
    // 運行状況の表示
    const operationStatusEl = document.getElementById('operationStatus');
    if (!applicableSchedule.isOperating) {
        operationStatusEl.textContent = '本日運休';
        operationStatusEl.classList.add('danger');
        
        // 運休時は時刻表示をクリア
        document.getElementById('nextBusTime').textContent = '-- : --';
        document.getElementById('nextBusRemaining').textContent = '運休';
        document.getElementById('afterNextBusTime').textContent = '-- : --';
        document.getElementById('afterNextBusRemaining').textContent = '運休';
        document.getElementById('upcomingBusList').innerHTML = '<div class="no-service">本日のバスの運行はありません</div>';
        return;
    } else {
        operationStatusEl.textContent = '運行中';
        operationStatusEl.classList.remove('danger');
    }
    
    // 次と次々のバスを取得
    const { next, afterNext, upcomingBuses } = getNextBuses(currentDirection, hour, minute);
    
    // 次のバス表示
    if (next) {
        document.getElementById('nextBusTime').textContent = formatTime(next.hour, next.minute);
        document.getElementById('nextBusRemaining').textContent = calculateRemainingTime(next.hour, next.minute, next.isNextDay);
    } else {
        document.getElementById('nextBusTime').textContent = '-- : --';
        document.getElementById('nextBusRemaining').textContent = '本日の運行は終了しました';
    }
    
    // 次々のバス表示
    if (afterNext) {
        document.getElementById('afterNextBusTime').textContent = formatTime(afterNext.hour, afterNext.minute);
        document.getElementById('afterNextBusRemaining').textContent = calculateRemainingTime(afterNext.hour, afterNext.minute, afterNext.isNextDay);
    } else {
        document.getElementById('afterNextBusTime').textContent = '-- : --';
        document.getElementById('afterNextBusRemaining').textContent = '本日の運行は終了しました';
    }
    
    // 今後のバス時刻リスト表示
    const upcomingBusListEl = document.getElementById('upcomingBusList');
    if (upcomingBuses.length > 0) {
        let html = '<h3>今後の発車時刻</h3><ul class="bus-list">';
        upcomingBuses.forEach(bus => {
            html += `
                <li class="bus-list-item">
                    <span class="bus-time">${formatTime(bus.hour, bus.minute)}</span>
                    <span class="bus-remaining">${calculateRemainingTime(bus.hour, bus.minute, bus.isNextDay)}</span>
                </li>
            `;
        });
        html += '</ul>';
        upcomingBusListEl.innerHTML = html;
    } else {
        upcomingBusListEl.innerHTML = '';
    }
}

// ページ読み込み時に初期化
document.addEventListener('DOMContentLoaded', init);
