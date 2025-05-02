let timeTableData;
let dayScheduleData;
const universityDirection = "産業大学前発";
const stationDirection = "JR住道駅発";
let upcomingBusCount = 5;

// 要素の存在を確認してから値を設定するヘルパー関数
function setElementText(id, text) {
    const element = document.getElementById(id);
    if (element) {
        element.textContent = text;
    } else {
        console.warn(`要素 ${id} が見つかりません`);
    }
}

// エラー表示関数
function displayError(message, details) {
    console.error(`${message}: ${details}`);
    
    const errorContainer = document.getElementById('error-container');
    if (errorContainer) {
        errorContainer.innerHTML = `
            <div class="error-message">
                <h2>エラーが発生しました</h2>
                <p>${message}</p>
                <p>エラー詳細: ${details}</p>
                <button onclick="window.location.reload()">再読み込み</button>
            </div>
        `;
    } else {
        document.body.innerHTML = `
            <div class="error-message" style="text-align: center; padding: 20px; margin: 20px; background-color: #ffdddd; border-radius: 10px;">
                <h2>エラーが発生しました</h2>
                <p>${message}</p>
                <p>エラー詳細: ${details}</p>
                <button onclick="window.location.reload()" style="padding: 10px 20px; margin-top: 10px; background-color: #3498db; color: white; border: none; border-radius: 5px; cursor: pointer;">再読み込み</button>
            </div>
        `;
    }
}

// 必須DOM要素が存在するか確認する関数
function checkRequiredElements() {
    const requiredIds = [
        'currentTime', 'currentDate', 'scheduleType', 'operationStatus',
        'nextBusTime-university', 'nextBusRemaining-university', 'afterNextBusTime-university', 'afterNextBusRemaining-university',
        'nextBusTime-station', 'nextBusRemaining-station', 'afterNextBusTime-station', 'afterNextBusRemaining-station',
        'upcomingBusList-university', 'upcomingBusList-station'
    ];
    
    const missingElements = requiredIds.filter(id => !document.getElementById(id));
    
    if (missingElements.length > 0) {
        throw new Error(`必要な要素が見つかりません: ${missingElements.join(', ')}`);
    }
    
    return true;
}

// 初期化関数
async function init() {
    try {
        // DOM要素の確認
        checkRequiredElements();
        
        // タブバーの設定
        setupTabBars();
        
        // データの読み込み
        const [timeResponse, dayResponse] = await Promise.all([
            fetch('time.json'),
            fetch('day.json')
        ]);
        
        if (!timeResponse.ok) {
            throw new Error('time.jsonの取得に失敗しました');
        }
        
        if (!dayResponse.ok) {
            throw new Error('day.jsonの取得に失敗しました');
        }
        
        timeTableData = await timeResponse.json();
        dayScheduleData = await dayResponse.json();
        
        // 初回表示
        updateDisplay();
        
        // 1分ごとに更新
        setInterval(updateDisplay, 60 * 1000);
    } catch (error) {
        displayError('時刻データの読み込みに失敗しました。ページを再読み込みしてください。', error.message);
    }
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

// 特定の方向のバス情報を更新
function updateDirectionDisplay(direction, directionSuffix, hour, minute, applicableSchedule) {
    try {
        // 次と次々のバスを取得
        const { next, afterNext, upcomingBuses } = getNextBuses(direction, hour, minute);
        
        // 次のバス表示
        if (next) {
            setElementText(`nextBusTime-${directionSuffix}`, formatTime(next.hour, next.minute));
            setElementText(`nextBusRemaining-${directionSuffix}`, calculateRemainingTime(next.hour, next.minute, next.isNextDay));
        } else {
            setElementText(`nextBusTime-${directionSuffix}`, '-- : --');
            setElementText(`nextBusRemaining-${directionSuffix}`, '本日の運行は終了しました');
        }
        
        // 次々のバス表示
        if (afterNext) {
            setElementText(`afterNextBusTime-${directionSuffix}`, formatTime(afterNext.hour, afterNext.minute));
            setElementText(`afterNextBusRemaining-${directionSuffix}`, calculateRemainingTime(afterNext.hour, afterNext.minute, afterNext.isNextDay));
        } else {
            setElementText(`afterNextBusTime-${directionSuffix}`, '-- : --');
            setElementText(`afterNextBusRemaining-${directionSuffix}`, '本日の運行は終了しました');
        }
        
        // 今後のバス時刻リスト表示
        const upcomingBusListEl = document.getElementById(`upcomingBusList-${directionSuffix}`);
        if (upcomingBusListEl) {
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
                upcomingBusListEl.innerHTML = '<h3>今後の発車時刻</h3><div class="no-service">この後の便はありません</div>';
            }
        }
    } catch (error) {
        console.error(`${direction}のバス情報更新中にエラーが発生しました:`, error);
    }
}

// 全体の表示を更新
function updateDisplay() {
    try {
        if (!timeTableData || !dayScheduleData) {
            console.error('時刻表データが読み込まれていません');
            return;
        }
        
        const now = new Date();
        const hour = now.getHours();
        const minute = now.getMinutes();
        
        // 現在時刻の表示
        setElementText('currentTime', formatTime(hour, minute));
        
        // 日付情報の表示
        setElementText('currentDate', formatDate(now));
        
        // 適用中のダイヤ種別を取得
        const applicableSchedule = getApplicableSchedule(now);
        setElementText('scheduleType', applicableSchedule.type);
        
        // 運行状況の表示
        const operationStatusEl = document.getElementById('operationStatus');
        if (operationStatusEl) {
            if (!applicableSchedule.isOperating) {
                operationStatusEl.textContent = '本日運休';
                operationStatusEl.classList.add('danger');
                
                // 運休時は両方向の時刻表示をクリア
                const universityList = document.getElementById('upcomingBusList-university');
                const stationList = document.getElementById('upcomingBusList-station');
                
                if (universityList) universityList.innerHTML = '<div class="no-service">本日のバスの運行はありません</div>';
                if (stationList) stationList.innerHTML = '<div class="no-service">本日のバスの運行はありません</div>';
                
                ['university', 'station'].forEach(directionSuffix => {
                    setElementText(`nextBusTime-${directionSuffix}`, '-- : --');
                    setElementText(`nextBusRemaining-${directionSuffix}`, '運休');
                    setElementText(`afterNextBusTime-${directionSuffix}`, '-- : --');
                    setElementText(`afterNextBusRemaining-${directionSuffix}`, '運休');
                });
                
                return;
            } else {
                operationStatusEl.textContent = '運行中';
                operationStatusEl.classList.remove('danger');
            }
        }
        
        // 両方向のバス情報を更新
        updateDirectionDisplay(universityDirection, 'university', hour, minute, applicableSchedule);
        updateDirectionDisplay(stationDirection, 'station', hour, minute, applicableSchedule);
    } catch (error) {
        displayError('表示の更新中にエラーが発生しました', error.message);
    }
}

// タブバーの開閉機能を設定
function setupTabBars() {
    try {
        // タブバーの開閉機能
        const tabBars = document.querySelectorAll('.tab-bar');
        
        // タブの初期状態を画面サイズに応じて設定
        const setInitialTabState = () => {
            const isMobile = window.innerWidth <= 600;
            tabBars.forEach(tab => {
                const content = tab.nextElementSibling;
                if (content) {
                    if (isMobile) {
                        // モバイルでは閉じた状態で開始
                        content.classList.add('closed');
                        tab.classList.remove('open');
                    } else {
                        // デスクトップでは開いた状態で開始
                        content.classList.remove('closed');
                        tab.classList.add('open');
                    }
                }
            });
        };
        
        // 初期状態を設定
        setInitialTabState();
        
        // クリックイベントを設定
        tabBars.forEach(tab => {
            tab.addEventListener('click', () => {
                const content = tab.nextElementSibling;
                if (content) {
                    content.classList.toggle('closed');
                    tab.classList.toggle('open');
                }
            });
        });
        
        // リサイズ時にも状態を調整
        window.addEventListener('resize', () => {
            setInitialTabState();
        });
    } catch (error) {
        console.error('タブバーの設定中にエラーが発生しました:', error);
    }
}

// 要素の読み込み完了を確認してから初期化
function domReadyInit() {
    try {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => setTimeout(init, 100));
        } else {
            // DOMが既にロード済みの場合、少し遅延させて実行
            setTimeout(init, 100);
        }
    } catch (error) {
        displayError('アプリケーション初期化中にエラーが発生しました', error.message);
    }
}

// スクリプト読み込み時に初期化を開始
domReadyInit();
